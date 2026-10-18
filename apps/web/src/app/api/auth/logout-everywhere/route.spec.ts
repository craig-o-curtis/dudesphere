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

// Made-up tokens. Nothing here comes from a real sign-in. The two read from
// cookies have the shapes readSessionCookies accepts: a three-part JWT, and
// 43 base64url characters. The fresh pair belongs to the same sign-in as
// the session cookie, so the two access tokens share a `sid`.
const ACCESS_TOKEN = accessTokenWith({ sub: "7", sid: SID, exp: 1_800_000_900 });
const REFRESH_TOKEN = "refresh-token-for-tests_0123456789abcdefABC";
const FRESH_PAIR: TokenPair = {
  accessToken: accessTokenWith({ sub: "7", sid: SID, exp: 1_800_001_750 }),
  refreshToken: "fresh-refresh-token-for-tests",
  expiresIn: 900,
};
// Another account's pair: what a planted refresh cookie swaps to.
const OTHER_PAIR: TokenPair = {
  accessToken: accessTokenWith({ sub: "8", sid: OTHER_SID, exp: 1_800_001_750 }),
  refreshToken: "other-refresh-token-for-tests",
  expiresIn: 900,
};

const SIGN_OUT_EVERYWHERE = `${API_URL}/auth/sign-out-everywhere`;
const REFRESH = `${API_URL}/auth/token/refresh`;
const REVOKE = `${API_URL}/auth/token/revoke`;
const SIGN_OUT = `${API_URL}/auth/sign-out`;

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

function logoutEverywhereRequest(headers: Record<string, string> = { origin: APP_ORIGIN }) {
  return new Request(`${APP_ORIGIN}/api/auth/logout-everywhere`, {
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

function unauthorized() {
  return jsonResponse(401, { statusCode: 401, message: "Unauthorized" });
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

// apiFetch sends a body as a JSON string, or none at all.
function sentBody(init: RequestInit | undefined): string {
  if (init?.body === undefined) return "no-body";
  return typeof init.body === "string" ? init.body : "a body that isn't a string";
}

/** Each call to Nest as "URL Bearer-token-or-none body-or-none", in order. */
function nestCalls(): string[] {
  return fetchMock.mock.calls.map(([input, init]) => {
    const bearer = new Headers(init?.headers).get("authorization") ?? "no-bearer";
    return `${urlOf(input)} ${bearer} ${sentBody(init)}`;
  });
}

function signOutEverywhereWith(token: string) {
  return `${SIGN_OUT_EVERYWHERE} Bearer ${token} no-body`;
}

function refreshWith(refreshToken: string) {
  return `${REFRESH} no-bearer ${JSON.stringify({ refreshToken })}`;
}

function signOutWith(token: string) {
  return `${SIGN_OUT} Bearer ${token} no-body`;
}

/** True when no call went to Nest's revoke route. */
function expectNoRevoke() {
  expect(fetchMock.mock.calls.map(([input]) => urlOf(input))).not.toContain(REVOKE);
}

function serverError() {
  return jsonResponse(500, { statusCode: 500, message: "Internal server error" });
}

function noAnswer(): never {
  throw new TypeError("fetch failed");
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

// The home page reads this query to tell the member that only this device
// was signed out. fe-tdd-dev's message on / depends on the exact value.
function expectPartialSignOut(response: Response) {
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("/?signout=partial");
  expect(response.body).toBeNull();
}

// The home page reads this query to tell the member that the sign-in had
// already ended at Nest. fe-tdd-dev's message on / depends on the exact value.
function expectEndedSignOut(response: Response) {
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("/?signout=ended");
  expect(response.body).toBeNull();
}

/** Everything the handler logged, joined, so a test can look for a token in it. */
function everythingLogged(...spies: { mock: { calls: unknown[][] } }[]): string {
  return spies
    .flatMap((spy) => spy.mock.calls)
    .flat()
    .map((part) => (part instanceof Error ? `${part.message} ${String(part.cause)}` : String(part)))
    .join("\n");
}

function quietConsole() {
  return {
    warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
    error: vi.spyOn(console, "error").mockImplementation(() => {}),
  };
}

beforeEach(async () => {
  vi.stubEnv("API_URL", API_URL);
  vi.stubEnv("BFF_SECRET", undefined);
  vi.stubGlobal("fetch", fetchMock);
  cookies.mockResolvedValue(cookieStore);
  headers.mockResolvedValue(new Headers());
  savedCookies({});
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

    const response = await POST(logoutEverywhereRequest(headers));

    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("location")).toBeNull();
    expect(cookies).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("with a live access token", () => {
  it("signs out everywhere with that token, once, and never refreshes", async () => {
    signedIn();
    nestAnswers({ [SIGN_OUT_EVERYWHERE]: [noContent] });

    const response = await POST(logoutEverywhereRequest());

    expect(nestCalls()).toEqual([signOutEverywhereWith(ACCESS_TOKEN)]);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
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
      [SIGN_OUT_EVERYWHERE]: [
        () => {
          setCallsWhenNestAnswered = cookieStore.set.mock.calls.length;
          return noContent();
        },
      ],
    });

    await POST(logoutEverywhereRequest());

    expect(setCallsWhenNestAnswered).toBe(0);
    expect(cookieStore.set).toHaveBeenCalledTimes(2);
  });
});

// Nothing ties a refresh token to this browser's sign-in without the session
// cookie's `sid`, and a lone refresh cookie may be a planted one. So it is
// never sent to Nest: no refresh, no revoke (SEC-6, AUTH-8 review round 2).
describe("with no usable access token", () => {
  it.each([
    ["no session cookie", { "__Secure-refresh": REFRESH_TOKEN }],
    [
      "a malformed session cookie",
      { "__Host-session": "not-a-jwt", "__Secure-refresh": REFRESH_TOKEN },
    ],
  ])("with %s: makes no Nest call, clears both cookies and says partial", async (_what, saved) => {
    savedCookies(saved);

    const response = await POST(logoutEverywhereRequest());

    expect(fetchMock).not.toHaveBeenCalled();
    expectBothCookiesCleared();
    expectPartialSignOut(response);
  });
});

// SEC-6. The fresh pair must belong to the session cookie's sign-in before
// its access token signs anyone out everywhere. Otherwise a planted refresh
// cookie would sign the attacker's account out everywhere and send the
// member to "/", a false success.
describe("the sign-in check after a refresh", () => {
  it.each([
    ["another sign-in's sid", OTHER_PAIR],
    ["no sid", { ...FRESH_PAIR, accessToken: accessTokenWith({ sub: "7" }) }],
  ])(
    "a fresh pair with %s: no further call, no revoke, clears and says partial",
    async (_what, pair) => {
      const { warn, error } = quietConsole();
      signedIn();
      nestAnswers({
        [SIGN_OUT_EVERYWHERE]: [unauthorized],
        [REFRESH]: [() => jsonResponse(200, pair)],
      });

      const response = await POST(logoutEverywhereRequest());

      expect(nestCalls()).toEqual([
        signOutEverywhereWith(ACCESS_TOKEN),
        refreshWith(REFRESH_TOKEN),
      ]);
      expectBothCookiesCleared();
      expectPartialSignOut(response);
      expect(warn.mock.calls).toEqual([
        [
          "Sign out everywhere: skipped the refresh token, it doesn't belong to the session cookie's sign-in.",
        ],
      ]);
      const logged = everythingLogged(warn, error);
      for (const token of [ACCESS_TOKEN, REFRESH_TOKEN, pair.accessToken]) {
        expect(logged).not.toContain(token);
      }
    },
  );

  it("makes no refresh-token call when the session token has no sid, and says partial", async () => {
    quietConsole();
    const noSid = accessTokenWith({ sub: "7", exp: 1_800_000_900 });
    savedCookies({ "__Host-session": noSid, "__Secure-refresh": REFRESH_TOKEN });
    nestAnswers({ [SIGN_OUT_EVERYWHERE]: [unauthorized] });

    const response = await POST(logoutEverywhereRequest());

    expect(nestCalls()).toEqual([signOutEverywhereWith(noSid)]);
    expectBothCookiesCleared();
    expectPartialSignOut(response);
  });
});

describe("when Nest refuses the access token with a 401", () => {
  it("refreshes once and tries again with the fresh access token", async () => {
    signedIn();
    nestAnswers({
      [SIGN_OUT_EVERYWHERE]: [unauthorized, noContent],
      [REFRESH]: [() => jsonResponse(200, FRESH_PAIR)],
    });

    const response = await POST(logoutEverywhereRequest());

    expect(nestCalls()).toEqual([
      signOutEverywhereWith(ACCESS_TOKEN),
      refreshWith(REFRESH_TOKEN),
      signOutEverywhereWith(FRESH_PAIR.accessToken),
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
      [SIGN_OUT_EVERYWHERE]: [unauthorized, noContent],
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
    const fromSignOut = POST(logoutEverywhereRequest());
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    answer(jsonResponse(200, FRESH_PAIR));
    const [pair, response] = await Promise.all([fromRefresh, fromSignOut]);

    expect(pair).toEqual(FRESH_PAIR);
    expect(nestCalls()).toEqual([
      refreshWith(REFRESH_TOKEN),
      signOutEverywhereWith(ACCESS_TOKEN),
      signOutEverywhereWith(FRESH_PAIR.accessToken),
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
      [SIGN_OUT_EVERYWHERE]: [unauthorized],
    });
    // The same fresh module the route loaded, so the two share one Map.
    const { refreshOnce } = await import("@/lib/refresh");
    await refreshOnce(REFRESH_TOKEN);

    const response = await POST(logoutEverywhereRequest());

    expect(nestCalls()).toEqual([refreshWith(REFRESH_TOKEN), signOutEverywhereWith(ACCESS_TOKEN)]);
    expect(nestCalls().join("\n")).not.toContain(OTHER_PAIR.accessToken);
    expectNoRevoke();
    expectBothCookiesCleared();
    expectPartialSignOut(response);
    expect(warn.mock.calls).toEqual([
      [
        "Sign out everywhere: skipped the refresh token, it doesn't belong to the session cookie's sign-in.",
      ],
    ]);
  });

  // Both access tokens were refused, so neither can sign this device out,
  // and the refresh cookie's own token is never revoked untied.
  it("gives up after the second 401, with no second refresh and no fallback", async () => {
    quietConsole();
    signedIn();
    nestAnswers({
      [SIGN_OUT_EVERYWHERE]: [unauthorized, unauthorized],
      [REFRESH]: [() => jsonResponse(200, FRESH_PAIR)],
    });

    const response = await POST(logoutEverywhereRequest());

    expect(nestCalls()).toEqual([
      signOutEverywhereWith(ACCESS_TOKEN),
      refreshWith(REFRESH_TOKEN),
      signOutEverywhereWith(FRESH_PAIR.accessToken),
    ]);
    expectBothCookiesCleared();
    expectPartialSignOut(response);
  });

  // Nest can't say why it refused the access token: out of date, or a
  // sign-in already ended. With no refresh cookie to ask, nobody knows
  // whether other devices are still signed in, so this counts as partial.
  it("stops when there is no refresh cookie to swap, still clears, and says partial", async () => {
    quietConsole();
    savedCookies({ "__Host-session": ACCESS_TOKEN });
    nestAnswers({ [SIGN_OUT_EVERYWHERE]: [unauthorized] });

    const response = await POST(logoutEverywhereRequest());

    expect(nestCalls()).toEqual([signOutEverywhereWith(ACCESS_TOKEN)]);
    expectBothCookiesCleared();
    expectPartialSignOut(response);
  });
});

// QA-12. Nest refuses the refresh token with a 401 when its sign-in is
// already over, for example after Sign out everywhere on another device.
// Then there is nothing left to end here, and the member is told so.
describe("when Nest refuses the refresh token with a 401", () => {
  it.each([
    [
      "after a 401 to the access token",
      { "__Host-session": ACCESS_TOKEN, "__Secure-refresh": REFRESH_TOKEN },
      { [SIGN_OUT_EVERYWHERE]: [unauthorized], [REFRESH]: [unauthorized] },
      [signOutEverywhereWith(ACCESS_TOKEN), refreshWith(REFRESH_TOKEN)],
    ],
  ] satisfies [string, Record<string, string>, Record<string, (() => Response)[]>, string[]][])(
    "%s: clears both cookies, skips the revoke and says the sign-in had ended",
    async (_what, saved, plan, calls) => {
      savedCookies(saved);
      nestAnswers(plan);

      const response = await POST(logoutEverywhereRequest());

      // No revoke: Nest just said this refresh token's sign-in is over.
      expect(nestCalls()).toEqual(calls);
      expectBothCookiesCleared();
      expectEndedSignOut(response);
    },
  );

  it("logs nothing, since an ended sign-in is not a failure", async () => {
    const { warn, error } = quietConsole();
    signedIn();
    nestAnswers({ [SIGN_OUT_EVERYWHERE]: [unauthorized], [REFRESH]: [unauthorized] });

    await POST(logoutEverywhereRequest());

    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("says partial, not ended, when the retry after a good refresh gets a 401", async () => {
    quietConsole();
    signedIn();
    nestAnswers({
      [SIGN_OUT_EVERYWHERE]: [unauthorized, unauthorized],
      [REFRESH]: [() => jsonResponse(200, FRESH_PAIR)],
    });

    const response = await POST(logoutEverywhereRequest());

    expectPartialSignOut(response);
  });
});

describe("with both tokens missing", () => {
  it("calls Nest not at all, and still clears and redirects", async () => {
    const response = await POST(logoutEverywhereRequest());

    expect(fetchMock).not.toHaveBeenCalled();
    expectBothCookiesCleared();
    expectSeeOtherToHome(response);
  });
});

// When signing out everywhere fails, this device's own sign-in is still
// ended if it can be, with POST /auth/sign-out and the newest access token
// tied to it: the session's own, or a fresh one whose `sid` matched. Never a
// revoke of the refresh cookie's token: nothing ties it to this sign-in, and
// a planted one would end the attacker's sign-in instead. After a 401 there
// is no fallback, since a refused token can't sign out either.
describe("the fallback sign-out, when signing out everywhere fails", () => {
  type Answer = () => Response | Promise<Response>;

  // Each way the sign-out-everywhere step can fail with a refresh cookie
  // present: what Nest answers, the calls made before the fallback, and the
  // access token the fallback uses, or null for none.
  const failures: [string, Record<string, Answer[]>, string[], string | null][] = [
    [
      "a 500 to the access token",
      { [SIGN_OUT_EVERYWHERE]: [serverError] },
      [signOutEverywhereWith(ACCESS_TOKEN)],
      ACCESS_TOKEN,
    ],
    [
      "a 503 that isn't JSON",
      { [SIGN_OUT_EVERYWHERE]: [() => new Response("Bad gateway", { status: 503 })] },
      [signOutEverywhereWith(ACCESS_TOKEN)],
      ACCESS_TOKEN,
    ],
    [
      "a 403 to the access token",
      {
        [SIGN_OUT_EVERYWHERE]: [() => jsonResponse(403, { statusCode: 403, message: "Forbidden" })],
      },
      [signOutEverywhereWith(ACCESS_TOKEN)],
      ACCESS_TOKEN,
    ],
    [
      "no answer to the access token",
      { [SIGN_OUT_EVERYWHERE]: [noAnswer] },
      [signOutEverywhereWith(ACCESS_TOKEN)],
      ACCESS_TOKEN,
    ],
    [
      "a refresh that gets a 429 after a 401",
      {
        [SIGN_OUT_EVERYWHERE]: [unauthorized],
        [REFRESH]: [() => jsonResponse(429, { statusCode: 429, message: "Too many requests" })],
      },
      [signOutEverywhereWith(ACCESS_TOKEN), refreshWith(REFRESH_TOKEN)],
      null,
    ],
    [
      "a refresh that gets no answer after a 401",
      { [SIGN_OUT_EVERYWHERE]: [unauthorized], [REFRESH]: [noAnswer] },
      [signOutEverywhereWith(ACCESS_TOKEN), refreshWith(REFRESH_TOKEN)],
      null,
    ],
    [
      "a refresh that gets a 400 after a 401",
      {
        [SIGN_OUT_EVERYWHERE]: [unauthorized],
        [REFRESH]: [() => jsonResponse(400, { statusCode: 400, message: ["bad"] })],
      },
      [signOutEverywhereWith(ACCESS_TOKEN), refreshWith(REFRESH_TOKEN)],
      null,
    ],
    [
      "a refresh that gets a 500 after a 401",
      { [SIGN_OUT_EVERYWHERE]: [unauthorized], [REFRESH]: [serverError] },
      [signOutEverywhereWith(ACCESS_TOKEN), refreshWith(REFRESH_TOKEN)],
      null,
    ],
    [
      "a second 401 after the refresh",
      {
        [SIGN_OUT_EVERYWHERE]: [unauthorized, unauthorized],
        [REFRESH]: [() => jsonResponse(200, FRESH_PAIR)],
      },
      [
        signOutEverywhereWith(ACCESS_TOKEN),
        refreshWith(REFRESH_TOKEN),
        signOutEverywhereWith(FRESH_PAIR.accessToken),
      ],
      null,
    ],
    [
      "a 500 to the retry after the refresh",
      {
        [SIGN_OUT_EVERYWHERE]: [unauthorized, serverError],
        [REFRESH]: [() => jsonResponse(200, FRESH_PAIR)],
      },
      [
        signOutEverywhereWith(ACCESS_TOKEN),
        refreshWith(REFRESH_TOKEN),
        signOutEverywhereWith(FRESH_PAIR.accessToken),
      ],
      FRESH_PAIR.accessToken,
    ],
  ];

  it.each(failures)(
    "after %s: never revokes, signs this device out only with a tied access token, and says partial",
    async (_what, plan, before, fallbackToken) => {
      quietConsole();
      signedIn();
      nestAnswers({ ...plan, [SIGN_OUT]: [noContent], [REVOKE]: [noContent] });

      const response = await POST(logoutEverywhereRequest());

      const fallback = fallbackToken === null ? [] : [signOutWith(fallbackToken)];
      expect(nestCalls()).toEqual([...before, ...fallback]);
      expectNoRevoke();
      expectBothCookiesCleared();
      expectPartialSignOut(response);
    },
  );

  it.each([
    [
      "with the access token",
      { [SIGN_OUT_EVERYWHERE]: [noContent] },
      { "__Host-session": ACCESS_TOKEN, "__Secure-refresh": REFRESH_TOKEN },
    ],
    [
      "after a 401 and a refresh",
      {
        [SIGN_OUT_EVERYWHERE]: [unauthorized, noContent],
        [REFRESH]: [() => jsonResponse(200, FRESH_PAIR)],
      },
      { "__Host-session": ACCESS_TOKEN, "__Secure-refresh": REFRESH_TOKEN },
    ],
  ] satisfies [string, Record<string, Answer[]>, Record<string, string>][])(
    "makes no fallback call after a success %s, and sends / with no partial flag",
    async (_what, plan, saved) => {
      savedCookies(saved);
      nestAnswers(plan);

      const response = await POST(logoutEverywhereRequest());

      const urls = fetchMock.mock.calls.map(([input]) => urlOf(input));
      expect(urls).not.toContain(REVOKE);
      expect(urls).not.toContain(SIGN_OUT);
      expectSeeOtherToHome(response);
    },
  );

  it.each([
    ["a 500", serverError],
    ["no answer", noAnswer],
  ])(
    "signs this device out with the access token alone, with no refresh cookie, after %s",
    async (_what, failure) => {
      quietConsole();
      savedCookies({ "__Host-session": ACCESS_TOKEN });
      nestAnswers({ [SIGN_OUT_EVERYWHERE]: [failure], [SIGN_OUT]: [noContent] });

      const response = await POST(logoutEverywhereRequest());

      expect(nestCalls()).toEqual([signOutEverywhereWith(ACCESS_TOKEN), signOutWith(ACCESS_TOKEN)]);
      expectBothCookiesCleared();
      expectPartialSignOut(response);
    },
  );

  it.each([
    ["a 500", serverError],
    ["a 401", unauthorized],
    ["no answer", noAnswer],
  ])("still clears and says partial when the fallback sign-out gets %s", async (_what, failure) => {
    quietConsole();
    signedIn();
    nestAnswers({ [SIGN_OUT_EVERYWHERE]: [serverError], [SIGN_OUT]: [failure] });

    const response = await POST(logoutEverywhereRequest());

    expect(nestCalls()).toEqual([signOutEverywhereWith(ACCESS_TOKEN), signOutWith(ACCESS_TOKEN)]);
    expectBothCookiesCleared();
    expectPartialSignOut(response);
  });

  it("clears the cookies only after the fallback sign-out has answered", async () => {
    quietConsole();
    signedIn();
    // Counted, not asserted, inside fetch: the handler swallows anything
    // thrown there, so a failed expect would go unseen.
    let setCallsWhenSignOutAnswered = -1;
    nestAnswers({
      [SIGN_OUT_EVERYWHERE]: [serverError],
      [SIGN_OUT]: [
        () => {
          setCallsWhenSignOutAnswered = cookieStore.set.mock.calls.length;
          return noContent();
        },
      ],
    });

    await POST(logoutEverywhereRequest());

    expect(setCallsWhenSignOutAnswered).toBe(0);
    expect(cookieStore.set).toHaveBeenCalledTimes(2);
  });
});

// A sibling subdomain can plant its own `__Secure-refresh` with a Domain
// attribute, and the browser then sends both. Next reads the last one, the
// planted one. A refresh would then sign out the attacker's account
// everywhere and tell the member it was theirs, and a revoke would end the
// attacker's sign-in. So with the cookie sent twice, no call uses the
// refresh token. The session cookie is `__Host-`, which no subdomain can
// plant, so its access token is still the member's to use.
describe("a refresh cookie sent more than once", () => {
  const PLANTED = "planted-refresh-token-for-tests_0123456789a";
  const ONCE = `__Host-session=${ACCESS_TOKEN}; __Secure-refresh=${REFRESH_TOKEN}`;
  const TWICE = `${ONCE}; __Secure-refresh=${PLANTED}`;
  const WARNING =
    "Sign out everywhere: skipped the refresh token, the refresh cookie was sent more than once.";

  function twiceRequest(origin = APP_ORIGIN) {
    return logoutEverywhereRequest({ origin, cookie: TWICE });
  }

  // What Next's cookie store gives for TWICE: the last value wins.
  function storeReadsLastOne(withAccessToken = true) {
    savedCookies({
      ...(withAccessToken ? { "__Host-session": ACCESS_TOKEN } : {}),
      "__Secure-refresh": PLANTED,
    });
  }

  it("signs out everywhere with the live access token, then clears and sends /", async () => {
    const { warn } = quietConsole();
    storeReadsLastOne();
    nestAnswers({ [SIGN_OUT_EVERYWHERE]: [noContent] });

    const response = await POST(twiceRequest());

    expect(nestCalls()).toEqual([signOutEverywhereWith(ACCESS_TOKEN)]);
    expectBothCookiesCleared();
    expectSeeOtherToHome(response);
    expect(warn.mock.calls).toEqual([[WARNING]]);
    expect(everythingLogged(warn)).not.toContain(PLANTED);
  });

  it.each([
    ["a 401", unauthorized],
    ["a 500", serverError],
    ["no answer", noAnswer],
  ])(
    "after %s to the access token: no refresh, no revoke, clears and says partial",
    async (_what, failure) => {
      const { warn, error } = quietConsole();
      storeReadsLastOne();
      nestAnswers({ [SIGN_OUT_EVERYWHERE]: [failure] });

      const response = await POST(twiceRequest());

      expect(nestCalls()).toEqual([signOutEverywhereWith(ACCESS_TOKEN)]);
      expectBothCookiesCleared();
      expectPartialSignOut(response);
      const logged = everythingLogged(warn, error);
      expect(logged).toContain(WARNING);
      for (const token of [ACCESS_TOKEN, REFRESH_TOKEN, PLANTED]) {
        expect(logged).not.toContain(token);
      }
    },
  );

  it("with no access token: calls Nest not at all, clears and says partial", async () => {
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

  it("refreshes and retries as before with the cookie sent once", async () => {
    signedIn();
    nestAnswers({
      [SIGN_OUT_EVERYWHERE]: [unauthorized, noContent],
      [REFRESH]: [() => jsonResponse(200, FRESH_PAIR)],
    });

    const response = await POST(logoutEverywhereRequest({ origin: APP_ORIGIN, cookie: ONCE }));

    expect(nestCalls()).toEqual([
      signOutEverywhereWith(ACCESS_TOKEN),
      refreshWith(REFRESH_TOKEN),
      signOutEverywhereWith(FRESH_PAIR.accessToken),
    ]);
    expectSeeOtherToHome(response);
  });
});

describe("logging", () => {
  it("logs each failed step and its status, and never a token", async () => {
    const { warn, error } = quietConsole();
    signedIn();
    nestAnswers({
      [SIGN_OUT_EVERYWHERE]: [
        unauthorized,
        () => jsonResponse(500, { statusCode: 500, message: `bad ${FRESH_PAIR.accessToken}` }),
      ],
      [REFRESH]: [() => jsonResponse(200, FRESH_PAIR)],
      [SIGN_OUT]: [
        () => jsonResponse(502, { statusCode: 502, message: `bad ${FRESH_PAIR.accessToken}` }),
      ],
    });

    await POST(logoutEverywhereRequest());

    const logged = everythingLogged(warn, error);
    expect(logged).toContain("POST /auth/sign-out-everywhere answered 500");
    expect(logged).toContain("POST /auth/sign-out answered 502");
    for (const token of [
      ACCESS_TOKEN,
      REFRESH_TOKEN,
      FRESH_PAIR.accessToken,
      FRESH_PAIR.refreshToken,
    ]) {
      expect(logged).not.toContain(token);
    }
  });
});

describe("when API_URL is unset, a bug in the app's setup", () => {
  it("still clears both cookies and answers 303, and logs the setup error", async () => {
    vi.stubEnv("API_URL", "");
    const { error } = quietConsole();
    signedIn();

    const response = await POST(logoutEverywhereRequest());

    expect(fetchMock).not.toHaveBeenCalled();
    expectBothCookiesCleared();
    expectPartialSignOut(response);
    expect(everythingLogged(error)).toContain("API_URL is not set");
    expect(everythingLogged(error)).not.toContain(ACCESS_TOKEN);
    expect(everythingLogged(error)).not.toContain(REFRESH_TOKEN);
  });
});
