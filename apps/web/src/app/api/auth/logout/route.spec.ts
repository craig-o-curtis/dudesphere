// @vitest-environment node
// A Route Handler runs on the server, so these tests run in Node, with Node's
// own Request, Response and fetch. lib/session.ts, lib/refresh.ts and
// lib/api.ts are the real modules: only the cookie store, the request
// headers, fetch and API_URL are stand-ins.
//
// lib/refresh.ts keeps settled pairs for 10 seconds in a module-level Map.
// Each test loads fresh modules through vi.resetModules(), so no test gets a
// pair another test made.

import type { TokenPair } from "@dudesphere/api-types";

// The real package throws when imported outside a React Server Component
// build. Next resolves it to an empty module on the server; this does the same.
vi.mock("server-only", () => ({}));

// vi.hoisted keeps one fake across vi.resetModules(), so the test and the
// fresh route module share it. apiFetch reads the request's headers with
// headers(), for the API-10 pair, so the fake gives an empty set.
const { cookies, headers } = vi.hoisted(() => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("next/headers", () => ({ cookies, headers }));

type RouteModule = typeof import("./route");

let route: RouteModule;
let POST: RouteModule["POST"];

const API_URL = "http://api.example.com";
const APP_ORIGIN = "http://localhost:3001";

// Made-up sign-in ids, shaped like the UUIDs Nest uses.
const SID = "0b7e5c1a-4f2d-4c3b-9a8e-1d2c3b4a5f6e";
const OTHER_SID = "9f8e7d6c-5b4a-4321-8fed-cba987654321";

// A JWT-shaped access token with these claims and a made-up signature. The
// handler reads `sid` from it without checking the signature.
function accessTokenWith(claims: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "HS256", typ: "JWT" })}.${part(claims)}.signature_for-tests`;
}

// Made-up tokens. Nothing here comes from a real sign-in.
// The shapes readSessionCookies accepts: a three-part JWT, and 43 base64url
// characters.
const ACCESS_TOKEN = accessTokenWith({ sub: "7", sid: SID, exp: 1_800_000_900 });
const REFRESH_TOKEN = "refresh-token-for-tests_0123456789abcdefABC";
// A fresh pair of the same sign-in, and one of another account's sign-in:
// what a planted refresh cookie swaps to.
const FRESH_PAIR: TokenPair = {
  accessToken: accessTokenWith({ sub: "7", sid: SID, exp: 1_800_001_750 }),
  refreshToken: "fresh-refresh-token-for-tests_0123456789abc",
  expiresIn: 900,
};
const OTHER_PAIR: TokenPair = {
  accessToken: accessTokenWith({ sub: "8", sid: OTHER_SID, exp: 1_800_001_750 }),
  refreshToken: "other-refresh-token-for-tests_0123456789ab",
  expiresIn: 900,
};

const SIGN_OUT = `${API_URL}/auth/sign-out`;
const REFRESH = `${API_URL}/auth/token/refresh`;
const REVOKE = `${API_URL}/auth/token/revoke`;

const fetchMock = vi.fn<typeof fetch>();

const cookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};

function savedCookies(values: Record<string, string>) {
  cookieStore.get.mockImplementation((name: string) =>
    Object.hasOwn(values, name) ? { name, value: values[name] } : undefined,
  );
}

function signedIn() {
  savedCookies({ "__Host-session": ACCESS_TOKEN, "__Secure-refresh": REFRESH_TOKEN });
}

function logoutRequest(headers: Record<string, string> = { origin: APP_ORIGIN }) {
  return new Request(`${APP_ORIGIN}/api/auth/logout`, {
    method: "POST",
    headers: { host: "localhost:3001", ...headers },
  });
}

function noContent() {
  return new Response(null, { status: 204 });
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** The exact cookie options clearSessionCookies sends for one cookie. */
function clearedAt(path: string) {
  return { httpOnly: true, secure: true, sameSite: "lax", path, maxAge: 0 };
}

function expectBothCookiesCleared() {
  expect(cookieStore.set).toHaveBeenCalledTimes(2);
  expect(cookieStore.set).toHaveBeenCalledWith("__Host-session", "", clearedAt("/"));
  expect(cookieStore.set).toHaveBeenCalledWith("__Secure-refresh", "", clearedAt("/api/auth"));
  expect(cookieStore.delete).not.toHaveBeenCalled();
}

function expectSeeOtherToHome(response: Response) {
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("/");
}

// The home page reads this query to tell the member the sign-out may not be
// complete.
function expectPartialSignOut(response: Response) {
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("/?signout=partial");
  expect(response.body).toBeNull();
}

function unauthorized() {
  return jsonResponse(401, { statusCode: 401, message: "Unauthorized" });
}

function serverError() {
  return jsonResponse(500, { statusCode: 500, message: "Internal server error" });
}

function noAnswer(): never {
  throw new TypeError("fetch failed");
}

/**
 * Answers each call to Nest by its URL, in order. Each URL gets its own list
 * of answers, used up one call at a time. A call nobody planned fails the test.
 */
function nestAnswers(plan: Record<string, (() => Response | Promise<Response>)[]>) {
  fetchMock.mockImplementation(async (input) => {
    const answer = plan[urlOf(input)]?.shift();
    if (!answer) throw new Error(`Unplanned call to ${urlOf(input)}`);
    return answer();
  });
}

function urlOf(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

/** Each call to Nest as "URL Bearer-token-or-none body-or-none", in order. */
function nestCalls(): string[] {
  return fetchMock.mock.calls.map(([input, init]) => {
    const bearer = new Headers(init?.headers).get("authorization") ?? "no-bearer";
    const body = typeof init?.body === "string" ? init.body : "no-body";
    return `${urlOf(input)} ${bearer} ${body}`;
  });
}

function signOutWith(token: string) {
  return `${SIGN_OUT} Bearer ${token} no-body`;
}

function refreshWith(refreshToken: string) {
  return `${REFRESH} no-bearer ${JSON.stringify({ refreshToken })}`;
}

function quietConsole() {
  return {
    warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
    error: vi.spyOn(console, "error").mockImplementation(() => {}),
  };
}

/** Everything the handler logged, joined, so a test can look for a token in it. */
function everythingLogged(...spies: { mock: { calls: unknown[][] } }[]): string {
  return spies
    .flatMap((spy) => spy.mock.calls)
    .flat()
    .map((part) => (part instanceof Error ? `${part.message} ${String(part.cause)}` : String(part)))
    .join("\n");
}

beforeEach(async () => {
  vi.stubEnv("API_URL", API_URL);
  vi.stubEnv("BFF_SECRET", undefined);
  vi.stubGlobal("fetch", fetchMock);
  cookies.mockResolvedValue(cookieStore);
  headers.mockResolvedValue(new Headers());
  savedCookies({});
  fetchMock.mockResolvedValue(noContent());
  vi.resetModules();
  route = await import("./route");
  POST = route.POST;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("the module", () => {
  it("exports POST and no other method, so Next answers 405 to the rest", () => {
    const methods = ["GET", "HEAD", "PUT", "PATCH", "DELETE", "OPTIONS"];

    expect(typeof route.POST).toBe("function");
    for (const method of methods) {
      expect(route).not.toHaveProperty(method);
    }
  });
});

describe("the Origin check", () => {
  it.each([
    ["another origin", { origin: "https://evil.example.com" }],
    ["no Origin", {}],
    ['Origin "null"', { origin: "null" }],
    [
      "an x-forwarded-host that differs from Origin",
      { origin: APP_ORIGIN, "x-forwarded-host": "evil.example.com" },
    ],
  ])("answers 403 to %s, and touches no cookie and no API", async (_what, headers) => {
    signedIn();

    const response = await POST(logoutRequest(headers));

    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("location")).toBeNull();
    expect(cookies).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// The access token comes first. `__Host-session` can't be planted, and
// Nest's POST /auth/sign-out ends exactly the sign-in its `sid` names: its
// whole refresh-token family, and its access tokens from the next request.
describe("with a live access token", () => {
  it("signs out with it once, with no refresh-token call", async () => {
    signedIn();
    nestAnswers({ [SIGN_OUT]: [noContent] });

    await POST(logoutRequest());

    expect(nestCalls()).toEqual([signOutWith(ACCESS_TOKEN)]);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
  });

  it("clears both cookies, each at its own path, and answers 303 with Location /", async () => {
    signedIn();
    nestAnswers({ [SIGN_OUT]: [noContent] });

    const response = await POST(logoutRequest());

    expectBothCookiesCleared();
    expectSeeOtherToHome(response);
    expect(response.body).toBeNull();
  });

  it("clears the cookies only after Nest has answered", async () => {
    signedIn();
    // Counted, not asserted, inside fetch: the handler swallows anything
    // thrown there, so a failed expect would go unseen.
    let setCallsWhenNestAnswered = -1;
    nestAnswers({
      [SIGN_OUT]: [
        () => {
          setCallsWhenNestAnswered = cookieStore.set.mock.calls.length;
          return noContent();
        },
      ],
    });

    await POST(logoutRequest());

    expect(setCallsWhenNestAnswered).toBe(0);
    expect(cookieStore.set).toHaveBeenCalledTimes(2);
  });

  it("signs out the same way with no refresh cookie", async () => {
    savedCookies({ "__Host-session": ACCESS_TOKEN });
    nestAnswers({ [SIGN_OUT]: [noContent] });

    const response = await POST(logoutRequest());

    expect(nestCalls()).toEqual([signOutWith(ACCESS_TOKEN)]);
    expectBothCookiesCleared();
    expectSeeOtherToHome(response);
  });
});

describe("with nothing to sign out", () => {
  it("calls Nest not at all for a visitor with no cookies, and still clears and sends /", async () => {
    const response = await POST(logoutRequest());

    expect(fetchMock).not.toHaveBeenCalled();
    expectBothCookiesCleared();
    expectSeeOtherToHome(response);
  });
});

// The access token lasts 15 minutes, so it is often out of date. Then the
// refresh token is swapped once, and the fresh access token signs out, but
// only when it belongs to the session cookie's sign-in (SEC-6, AUTH-8 review
// round 2): a single planted refresh cookie would otherwise end the
// attacker's sign-in and leave the member's live.
describe("when Nest refuses the access token with a 401", () => {
  it("refreshes once, checks the sid, and signs out with the fresh access token", async () => {
    signedIn();
    nestAnswers({
      [SIGN_OUT]: [unauthorized, noContent],
      [REFRESH]: [() => jsonResponse(200, FRESH_PAIR)],
    });

    const response = await POST(logoutRequest());

    expect(nestCalls()).toEqual([
      signOutWith(ACCESS_TOKEN),
      refreshWith(REFRESH_TOKEN),
      signOutWith(FRESH_PAIR.accessToken),
    ]);
    expectBothCookiesCleared();
    expectSeeOtherToHome(response);
  });

  // A sign-out can race a refresh of the same token, such as proxy's. Both
  // go through refreshOnce, so Nest sees the token once. Two calls would get
  // "reused", and Nest would end the sign-in under both.
  it("shares one Nest refresh call with a refresh of the same token at the same moment", async () => {
    quietConsole();
    signedIn();
    let answer!: (response: Response) => void;
    nestAnswers({
      [SIGN_OUT]: [unauthorized, noContent],
      [REFRESH]: [
        () =>
          new Promise<Response>((resolve) => {
            answer = resolve;
          }),
      ],
    });
    // The same fresh module the route loaded, so the two share one Map.
    const { refreshOnce } = await import("@/lib/refresh");

    const fromRefresh = refreshOnce(REFRESH_TOKEN);
    const fromSignOut = POST(logoutRequest());
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    answer(jsonResponse(200, FRESH_PAIR));
    const [pair, response] = await Promise.all([fromRefresh, fromSignOut]);

    expect(pair).toEqual(FRESH_PAIR);
    expect(nestCalls()).toEqual([
      refreshWith(REFRESH_TOKEN),
      signOutWith(ACCESS_TOKEN),
      signOutWith(FRESH_PAIR.accessToken),
    ]);
    expectBothCookiesCleared();
    expectSeeOtherToHome(response);
  });

  // QA-11. A planted refresh token that an earlier refresh already swapped
  // leaves another sign-in's pair held for 10 seconds. A sign-out that gets
  // that held pair checks its `sid` like any other, and never uses it.
  it("refuses a held pair from another sign-in, with no call using it", async () => {
    const { warn } = quietConsole();
    signedIn();
    nestAnswers({
      [REFRESH]: [() => jsonResponse(200, OTHER_PAIR)],
      [SIGN_OUT]: [unauthorized],
    });
    // The same fresh module the route loaded, so the two share one Map.
    const { refreshOnce } = await import("@/lib/refresh");
    await refreshOnce(REFRESH_TOKEN);

    const response = await POST(logoutRequest());

    expect(nestCalls()).toEqual([refreshWith(REFRESH_TOKEN), signOutWith(ACCESS_TOKEN)]);
    expect(nestCalls().join("\n")).not.toContain(OTHER_PAIR.accessToken);
    expectBothCookiesCleared();
    expectPartialSignOut(response);
    expect(warn.mock.calls).toEqual([
      ["Sign out: skipped the refresh token, it doesn't belong to the session cookie's sign-in."],
    ]);
  });

  it("never writes the fresh pair to a cookie", async () => {
    signedIn();
    nestAnswers({
      [SIGN_OUT]: [unauthorized, noContent],
      [REFRESH]: [() => jsonResponse(200, FRESH_PAIR)],
    });

    await POST(logoutRequest());

    expect(cookieStore.set.mock.calls.map(([, value]) => value)).toEqual(["", ""]);
  });

  it("makes no further call when the fresh pair is another sign-in's, and says partial", async () => {
    const { warn, error } = quietConsole();
    signedIn();
    nestAnswers({ [SIGN_OUT]: [unauthorized], [REFRESH]: [() => jsonResponse(200, OTHER_PAIR)] });

    const response = await POST(logoutRequest());

    expect(nestCalls()).toEqual([signOutWith(ACCESS_TOKEN), refreshWith(REFRESH_TOKEN)]);
    expectBothCookiesCleared();
    expectPartialSignOut(response);
    expect(warn.mock.calls).toEqual([
      ["Sign out: skipped the refresh token, it doesn't belong to the session cookie's sign-in."],
    ]);
    const logged = everythingLogged(warn, error);
    for (const token of [ACCESS_TOKEN, REFRESH_TOKEN, OTHER_PAIR.accessToken]) {
      expect(logged).not.toContain(token);
    }
  });

  it("makes no refresh-token call when the session token has no sid, and says partial", async () => {
    const noSid = accessTokenWith({ sub: "7", exp: 1_800_000_900 });
    savedCookies({ "__Host-session": noSid, "__Secure-refresh": REFRESH_TOKEN });
    nestAnswers({ [SIGN_OUT]: [unauthorized] });

    const response = await POST(logoutRequest());

    expect(nestCalls()).toEqual([signOutWith(noSid)]);
    expectBothCookiesCleared();
    expectPartialSignOut(response);
  });

  it("says partial with no refresh cookie to swap", async () => {
    savedCookies({ "__Host-session": ACCESS_TOKEN });
    nestAnswers({ [SIGN_OUT]: [unauthorized] });

    const response = await POST(logoutRequest());

    expect(nestCalls()).toEqual([signOutWith(ACCESS_TOKEN)]);
    expectPartialSignOut(response);
  });

  it("says partial, and logs nothing, when Nest refuses the refresh token too", async () => {
    const { warn, error } = quietConsole();
    signedIn();
    nestAnswers({ [SIGN_OUT]: [unauthorized], [REFRESH]: [unauthorized] });

    const response = await POST(logoutRequest());

    expect(nestCalls()).toEqual([signOutWith(ACCESS_TOKEN), refreshWith(REFRESH_TOKEN)]);
    expectBothCookiesCleared();
    expectPartialSignOut(response);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it.each([
    ["a refresh that gets a 500", { [REFRESH]: [serverError] }, 2],
    ["a refresh that gets no answer", { [REFRESH]: [noAnswer] }, 2],
    [
      "a second sign-out that gets a 500",
      { [REFRESH]: [() => jsonResponse(200, FRESH_PAIR)], [SIGN_OUT]: [unauthorized, serverError] },
      3,
    ],
  ])("says partial after %s, and logs it", async (_what, plan, calls) => {
    const { warn } = quietConsole();
    signedIn();
    nestAnswers({ [SIGN_OUT]: [unauthorized], ...plan });

    const response = await POST(logoutRequest());

    expect(fetchMock).toHaveBeenCalledTimes(calls);
    expectBothCookiesCleared();
    expectPartialSignOut(response);
    expect(warn).toHaveBeenCalled();
  });
});

describe("with no usable access token", () => {
  // Nothing ties the refresh token to this browser's sign-in, so it isn't
  // used: a lone refresh cookie may be a planted one.
  it.each([
    ["no session cookie", { "__Secure-refresh": REFRESH_TOKEN }],
    [
      "a malformed session cookie",
      { "__Host-session": "not-a-jwt", "__Secure-refresh": REFRESH_TOKEN },
    ],
  ])("with %s: makes no Nest call, clears both cookies and says partial", async (_what, saved) => {
    savedCookies(saved);

    const response = await POST(logoutRequest());

    expect(fetchMock).not.toHaveBeenCalled();
    expectBothCookiesCleared();
    expectPartialSignOut(response);
  });
});

// A sibling subdomain can plant its own `__Secure-refresh` with a Domain
// attribute, and the browser then sends both. Next reads the last one, the
// planted one. So with the cookie sent twice, no call uses a refresh token.
// The access token is still the member's, so it is used as usual (QA-6,
// AUTH-8 review round 2).
describe("a refresh cookie sent more than once", () => {
  const PLANTED = "planted-refresh-token-for-tests_0123456789a";
  const ONCE = `__Host-session=${ACCESS_TOKEN}; __Secure-refresh=${REFRESH_TOKEN}`;
  const TWICE = `${ONCE}; __Secure-refresh=${PLANTED}`;
  const WARNING =
    "Sign out: skipped the refresh token, the refresh cookie was sent more than once.";

  function twiceRequest(origin = APP_ORIGIN) {
    return logoutRequest({ origin, cookie: TWICE });
  }

  // What Next's cookie store gives for TWICE: the last value wins.
  function storeReadsLastOne(withAccessToken = true) {
    savedCookies({
      ...(withAccessToken ? { "__Host-session": ACCESS_TOKEN } : {}),
      "__Secure-refresh": PLANTED,
    });
  }

  it("signs out with the live access token, then clears and sends /", async () => {
    const { warn, error } = quietConsole();
    storeReadsLastOne();
    nestAnswers({ [SIGN_OUT]: [noContent] });

    const response = await POST(twiceRequest());

    expect(nestCalls()).toEqual([signOutWith(ACCESS_TOKEN)]);
    expectBothCookiesCleared();
    expectSeeOtherToHome(response);
    expect(warn.mock.calls).toEqual([[WARNING]]);
    expect(everythingLogged(warn, error)).not.toContain(PLANTED);
  });

  it.each([
    ["a 401", unauthorized],
    ["a 500", serverError],
    ["no answer", noAnswer],
  ])(
    "after %s to the access token: no refresh, clears and says partial",
    async (_what, failure) => {
      const { warn, error } = quietConsole();
      storeReadsLastOne();
      nestAnswers({ [SIGN_OUT]: [failure] });

      const response = await POST(twiceRequest());

      expect(nestCalls()).toEqual([signOutWith(ACCESS_TOKEN)]);
      expect(fetchMock.mock.calls.map(([input]) => urlOf(input))).not.toContain(REVOKE);
      expectBothCookiesCleared();
      expectPartialSignOut(response);
      const logged = everythingLogged(warn, error);
      expect(logged).toContain(WARNING);
      for (const token of [ACCESS_TOKEN, REFRESH_TOKEN, PLANTED]) {
        expect(logged).not.toContain(token);
      }
    },
  );

  it("with no access token: makes no Nest call, clears and says partial", async () => {
    const { warn } = quietConsole();
    storeReadsLastOne(false);

    const response = await POST(twiceRequest());

    expect(fetchMock).not.toHaveBeenCalled();
    expectBothCookiesCleared();
    expectPartialSignOut(response);
    expect(warn.mock.calls).toEqual([[WARNING]]);
  });

  it("still answers 403 to another origin first, touching no cookie", async () => {
    storeReadsLastOne();

    const response = await POST(twiceRequest("https://evil.example.com"));

    expect(response.status).toBe(403);
    expect(cookies).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes after a 401 as usual with the cookie sent once", async () => {
    signedIn();
    nestAnswers({
      [SIGN_OUT]: [unauthorized, noContent],
      [REFRESH]: [() => jsonResponse(200, FRESH_PAIR)],
    });

    const response = await POST(logoutRequest({ origin: APP_ORIGIN, cookie: ONCE }));

    expect(nestCalls()).toEqual([
      signOutWith(ACCESS_TOKEN),
      refreshWith(REFRESH_TOKEN),
      signOutWith(FRESH_PAIR.accessToken),
    ]);
    expectSeeOtherToHome(response);
  });
});

describe("when Nest fails", () => {
  it.each([
    ["a 500", serverError],
    ["a 503 that isn't JSON", () => new Response("Bad gateway", { status: 503 })],
    ["no answer", noAnswer],
  ])("still clears both cookies, and says partial after %s", async (_what, failure) => {
    quietConsole();
    signedIn();
    nestAnswers({ [SIGN_OUT]: [failure] });

    const response = await POST(logoutRequest());

    expect(nestCalls()).toEqual([signOutWith(ACCESS_TOKEN)]);
    expectBothCookiesCleared();
    expectPartialSignOut(response);
  });

  it("logs the failed step and status, and never a token", async () => {
    const { warn, error } = quietConsole();
    signedIn();
    nestAnswers({
      [SIGN_OUT]: [() => jsonResponse(500, { statusCode: 500, message: `bad ${ACCESS_TOKEN}` })],
    });

    await POST(logoutRequest());

    const logged = everythingLogged(warn, error);
    expect(logged).toContain("POST /auth/sign-out answered 500");
    expect(logged).not.toContain(REFRESH_TOKEN);
    expect(logged).not.toContain(ACCESS_TOKEN);
  });
});

describe("when API_URL is unset, a bug in the app's setup", () => {
  it("still clears both cookies, says partial, and logs the setup error", async () => {
    vi.stubEnv("API_URL", "");
    const { error } = quietConsole();
    signedIn();

    const response = await POST(logoutRequest());

    expect(fetchMock).not.toHaveBeenCalled();
    expectBothCookiesCleared();
    expectPartialSignOut(response);
    expect(everythingLogged(error)).toContain("API_URL is not set");
    expect(everythingLogged(error)).not.toContain(REFRESH_TOKEN);
    expect(everythingLogged(error)).not.toContain(ACCESS_TOKEN);
  });
});
