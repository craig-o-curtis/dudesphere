// lib/client-fetch.ts runs in the browser, so these tests run in jsdom.
// fetch and window.location are stand-ins. jsdom's own location.assign can't
// be spied on (it is non-configurable), so the whole location is stubbed.
//
// The shared refresh promise lives at module level. Each test loads a fresh
// copy of the module through vi.resetModules(), so no test sees another's.

const BFF = "/api/bff";
const REFRESH = "/api/auth/refresh";

const fetchMock = vi.fn<typeof fetch>();
const assign = vi.fn<(url: string) => void>();

let clientFetch: typeof import("./client-fetch").clientFetch;

function at(pathname: string, search = "") {
  vi.stubGlobal("location", { pathname, search, assign });
}

function urlOf(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

/** Every URL fetched, in order. */
function fetchedUrls(): string[] {
  return fetchMock.mock.calls.map(([input]) => urlOf(input));
}

function refreshCalls() {
  return fetchMock.mock.calls.filter(([input]) => urlOf(input) === REFRESH);
}

function bffCalls() {
  return fetchMock.mock.calls.filter(([input]) => urlOf(input).startsWith(`${BFF}/`));
}

function answerWith(code: number, body: string | null = null) {
  return new Response(body, { status: code });
}

function unauthorized() {
  return answerWith(401, JSON.stringify({ statusCode: 401, message: "Unauthorized" }));
}

type Answer = () => Response | Promise<Response>;

/**
 * Answers the BFF and the refresh route, each from its own list, used up one
 * call at a time. A call nobody planned fails the test.
 */
function answers(plan: { bff?: Answer[]; refresh?: Answer[] }) {
  fetchMock.mockImplementation(async (input) => {
    const url = urlOf(input);
    const list = url === REFRESH ? plan.refresh : url.startsWith(`${BFF}/`) ? plan.bff : undefined;
    const answer = list?.shift();
    if (!answer) throw new Error(`Unplanned call to ${url}`);
    return answer();
  });
}

/** A promise the test settles by hand, to hold a call open. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(async () => {
  fetchMock.mockReset();
  assign.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  at("/hashtags", "?sort=new");
  vi.resetModules();
  ({ clientFetch } = await import("./client-fetch"));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the path", () => {
  it.each([
    ["hashtags", "/api/bff/hashtags"],
    ["/hashtags", "/api/bff/hashtags"],
    ["users/me", "/api/bff/users/me"],
    ["/hashtags?q=dude&page=2", "/api/bff/hashtags?q=dude&page=2"],
    ["profiles/e2e-dude", "/api/bff/profiles/e2e-dude"],
  ])("calls %s at %s", async (path, url) => {
    answers({ bff: [() => answerWith(200, "[]")] });

    await clientFetch(path);

    expect(fetchedUrls()).toEqual([url]);
  });

  it.each([
    ["an empty path", ""],
    ["a bare slash", "/"],
    ["a protocol-relative path", "//evil.example.com/hashtags"],
    ["an absolute URL", "https://evil.example.com/hashtags"],
    ["a scheme with no slashes", "javascript:alert(1)"],
    ["a .. segment", "hashtags/../auth/refresh"],
    ["a leading .. segment", "../auth/refresh"],
    ["a . segment", "hashtags/./x"],
    ["an encoded .. segment", "hashtags/%2e%2E/auth/refresh"],
    ["an encoded . segment", "%2E/hashtags"],
    ["a backslash", "hashtags\\..\\auth"],
    ["an empty segment", "hashtags//x"],
  ])("refuses %s, and fetches nothing", async (_what, path) => {
    await expect(clientFetch(path)).rejects.toThrow(TypeError);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("doesn't let a .. in the query count as a segment", async () => {
    answers({ bff: [() => answerWith(200, "[]")] });

    await clientFetch("hashtags?q=../x");

    expect(fetchedUrls()).toEqual(["/api/bff/hashtags?q=../x"]);
  });
});

describe("the request body", () => {
  it("refuses a stream, which could not be sent again after a refresh", async () => {
    const body = new ReadableStream();

    await expect(clientFetch("abidings", { method: "POST", body })).rejects.toThrow(TypeError);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("with no 401", () => {
  it("gives back a 200 as is, with no refresh", async () => {
    const ok = answerWith(200, '{"id":1}');
    answers({ bff: [() => ok] });

    const response = await clientFetch("users/me");

    expect(response).toBe(ok);
    expect(refreshCalls()).toHaveLength(0);
    expect(assign).not.toHaveBeenCalled();
  });

  it.each([
    ["404, outside the allow-list", 404],
    ["502, Nest down", 502],
    ["403, an Origin mismatch", 403],
    ["400, a validation error", 400],
  ])("gives back a %s with no refresh", async (_what, code) => {
    const answer = answerWith(code);
    answers({ bff: [() => answer] });

    const response = await clientFetch("hashtags");

    expect(response).toBe(answer);
    expect(refreshCalls()).toHaveLength(0);
    expect(assign).not.toHaveBeenCalled();
  });

  it("sends credentials same-origin", async () => {
    answers({ bff: [() => answerWith(200)] });

    await clientFetch("users/me", { credentials: "omit" });

    expect(fetchMock.mock.calls[0]?.[1]?.credentials).toBe("same-origin");
  });
});

describe("on a 401", () => {
  it("refreshes once with a same-origin POST, retries once, and gives back the retry", async () => {
    const retried = answerWith(200, '{"id":1}');
    answers({ bff: [unauthorized, () => retried], refresh: [() => answerWith(204)] });

    const response = await clientFetch("users/me");

    expect(response).toBe(retried);
    expect(fetchedUrls()).toEqual(["/api/bff/users/me", REFRESH, "/api/bff/users/me"]);
    expect(refreshCalls()[0]?.[1]).toEqual({ method: "POST", credentials: "same-origin" });
    expect(assign).not.toHaveBeenCalled();
  });

  it("sends the caller's method, headers and body on the first call and the retry", async () => {
    answers({ bff: [unauthorized, () => answerWith(201)], refresh: [() => answerWith(204)] });
    const headers = { "Content-Type": "application/json", "X-Made-Up": "e2e-dude" };
    const body = JSON.stringify({ hashtag: "e2e0123456789ab" });

    await clientFetch("abidings", { method: "POST", headers, body });

    const sent = bffCalls().map(([, init]) => init);
    expect(sent).toHaveLength(2);
    for (const init of sent) {
      expect(init?.method).toBe("POST");
      expect(init?.body).toBe(body);
      expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
      expect(new Headers(init?.headers).get("x-made-up")).toBe("e2e-dude");
      expect(init?.credentials).toBe("same-origin");
    }
  });

  it("passes the caller's signal to both BFF calls, and not to the shared refresh", async () => {
    answers({ bff: [unauthorized, () => answerWith(200)], refresh: [() => answerWith(204)] });
    const controller = new AbortController();

    await clientFetch("users/me", { signal: controller.signal });

    expect(bffCalls().map(([, init]) => init?.signal)).toEqual([
      controller.signal,
      controller.signal,
    ]);
    expect(refreshCalls()[0]?.[1]?.signal).toBeUndefined();
  });

  it("retries only once: a second 401 sends the browser to sign-in with next", async () => {
    const second = unauthorized();
    answers({ bff: [unauthorized, () => second], refresh: [() => answerWith(204)] });

    const response = await clientFetch("users/me");

    expect(response).toBe(second);
    expect(bffCalls()).toHaveLength(2);
    expect(refreshCalls()).toHaveLength(1);
    expect(assign).toHaveBeenCalledExactlyOnceWith(
      `/login?next=${encodeURIComponent("/hashtags?sort=new")}`,
    );
  });

  it("builds next from the current path alone when there is no query", async () => {
    at("/feed");
    answers({ bff: [unauthorized], refresh: [() => answerWith(401)] });

    await clientFetch("users/me");

    expect(assign).toHaveBeenCalledExactlyOnceWith("/login?next=%2Ffeed");
  });

  it("sends the browser to sign-in when the refresh gets a 401, with no retry", async () => {
    const first = unauthorized();
    answers({ bff: [() => first], refresh: [() => answerWith(401)] });

    const response = await clientFetch("users/me");

    expect(response).toBe(first);
    expect(bffCalls()).toHaveLength(1);
    expect(assign).toHaveBeenCalledExactlyOnceWith(
      `/login?next=${encodeURIComponent("/hashtags?sort=new")}`,
    );
  });

  it.each([
    ["a 503, Nest down", () => answerWith(503)],
    ["a 403, an Origin mismatch", () => answerWith(403)],
    ["a 500", () => answerWith(500)],
    [
      "a network failure",
      () => {
        throw new TypeError("Failed to fetch");
      },
    ],
  ] satisfies [string, Answer][])(
    "gives back the original 401 after %s from the refresh, with no retry and no redirect",
    async (_what, refreshAnswer) => {
      const first = unauthorized();
      answers({ bff: [() => first], refresh: [refreshAnswer] });

      const response = await clientFetch("users/me");

      expect(response).toBe(first);
      expect(bffCalls()).toHaveLength(1);
      expect(assign).not.toHaveBeenCalled();
    },
  );

  it("makes one refresh for three 401s at once, then retries each", async () => {
    const refresh = deferred<Response>();
    answers({
      bff: [
        unauthorized,
        unauthorized,
        unauthorized,
        () => answerWith(200, "a"),
        () => answerWith(200, "b"),
        () => answerWith(200, "c"),
      ],
      refresh: [() => refresh.promise],
    });

    const calls = [clientFetch("users/me"), clientFetch("hashtags"), clientFetch("profiles/x")];
    await vi.waitFor(() => expect(refreshCalls()).toHaveLength(1));
    refresh.resolve(answerWith(204));
    const responses = await Promise.all(calls);

    expect(refreshCalls()).toHaveLength(1);
    expect(bffCalls()).toHaveLength(6);
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
    expect(assign).not.toHaveBeenCalled();
  });

  it("refreshes again on a later 401, once the first refresh has settled", async () => {
    answers({
      bff: [unauthorized, () => answerWith(200), unauthorized, () => answerWith(200)],
      refresh: [() => answerWith(204), () => answerWith(204)],
    });

    await clientFetch("users/me");
    await clientFetch("users/me");

    expect(refreshCalls()).toHaveLength(2);
    expect(bffCalls()).toHaveLength(4);
  });

  it("refreshes again after a refresh that failed on the network", async () => {
    answers({
      bff: [unauthorized, unauthorized, () => answerWith(200)],
      refresh: [
        () => {
          throw new TypeError("Failed to fetch");
        },
        () => answerWith(204),
      ],
    });

    const first = await clientFetch("users/me");
    const second = await clientFetch("users/me");

    expect(first.status).toBe(401);
    expect(second.status).toBe(200);
    expect(refreshCalls()).toHaveLength(2);
  });

  it("passes on an abort of the caller's own call", async () => {
    const abort = new DOMException("The operation was aborted.", "AbortError");
    fetchMock.mockRejectedValueOnce(abort);

    await expect(clientFetch("users/me")).rejects.toBe(abort);
    expect(refreshCalls()).toHaveLength(0);
  });
});
