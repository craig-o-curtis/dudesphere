// @vitest-environment node
// A Route Handler runs on the server, so these tests run in Node, with Node's
// own Request, Response and fetch. lib/session.ts, lib/refresh.ts and
// lib/api.ts are the real modules: only the cookie store, fetch and API_URL
// are stand-ins.
//
// lib/refresh.ts keeps settled pairs for 10 seconds in a module-level Map.
// Each test loads fresh modules through vi.resetModules(), so no test gets a
// pair another test made.

import type { TokenPair } from "@dudesphere/api-types";
import { NextRequest } from "next/server";

// The real package throws when imported outside a React Server Component
// build. Next resolves it to an empty module on the server; this does the same.
vi.mock("server-only", () => ({}));

// vi.hoisted keeps one fake across vi.resetModules(), so the test and the
// fresh route module share it.
const { cookies } = vi.hoisted(() => ({ cookies: vi.fn() }));
vi.mock("next/headers", () => ({ cookies }));

type RouteModule = typeof import("./route");

const API_URL = "http://api.example.com";
const APP_ORIGIN = "http://localhost:3001";
const REFRESH = `${API_URL}/auth/token/refresh`;

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
// 43 base64url characters. The old and the fresh access token belong to one
// sign-in, so they share a `sid`, as Nest's do through a refresh.
const ACCESS_TOKEN = accessTokenWith({
  sub: "7",
  sid: SID,
  iat: 1_800_000_000,
  exp: 1_800_000_900,
});
const REFRESH_TOKEN = "refresh-token-for-tests_0123456789abcdefABC";
const FRESH_PAIR: TokenPair = {
  accessToken: accessTokenWith({ sub: "7", sid: SID, iat: 1_800_000_850, exp: 1_800_001_750 }),
  refreshToken: "fresh-refresh-token-for-tests_0123456789abc",
  expiresIn: 900,
};
// Another account's pair: what a planted refresh cookie swaps to.
const OTHER_PAIR: TokenPair = {
  accessToken: accessTokenWith({
    sub: "8",
    sid: OTHER_SID,
    iat: 1_800_000_850,
    exp: 1_800_001_750,
  }),
  refreshToken: "other-refresh-token-for-tests_0123456789ab",
  expiresIn: 900,
};
const SID_WARNING =
  "Refresh: refused, the refresh token doesn't belong to the session cookie's sign-in.";

const SEVEN_DAYS = 604_800;

const fetchMock = vi.fn<typeof fetch>();

const cookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};

let route: RouteModule;

function savedCookies(values: Record<string, string>) {
  cookieStore.get.mockImplementation((name: string) =>
    Object.hasOwn(values, name) ? { name, value: values[name] } : undefined,
  );
}

function signedIn() {
  savedCookies({ "__Host-session": ACCESS_TOKEN, "__Secure-refresh": REFRESH_TOKEN });
}

/** A GET to the handler, with the raw query string after "?". */
function getRequest(query = "") {
  const search = query === "" ? "" : `?${query}`;
  return new NextRequest(`${APP_ORIGIN}/api/auth/refresh${search}`, {
    headers: { host: "localhost:3001" },
  });
}

/** A GET with `next` set to `value`, encoded as proxy encodes it. */
function getWithNext(value: string) {
  return getRequest(`next=${encodeURIComponent(value)}`);
}

function postRequest(headers: Record<string, string> = { origin: APP_ORIGIN }) {
  return new NextRequest(`${APP_ORIGIN}/api/auth/refresh`, {
    method: "POST",
    headers: { host: "localhost:3001", ...headers },
  });
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function nestGives(answer: () => Response | Promise<Response>) {
  fetchMock.mockImplementation(async () => answer());
}

function refreshed() {
  return jsonResponse(200, FRESH_PAIR);
}

function refused(message = "Refresh token reused") {
  return jsonResponse(401, { statusCode: 401, message, error: "Unauthorized" });
}

function serverError() {
  return jsonResponse(500, { statusCode: 500, message: "Internal server error" });
}

function tooManyRequests() {
  return jsonResponse(429, { statusCode: 429, message: "Too many requests" });
}

function noAnswer(): never {
  throw new TypeError("fetch failed");
}

// Every way Nest can be down: a 5xx, a 429 and no answer (status 0).
const NEST_DOWN: [string, () => Response][] = [
  ["a 500", serverError],
  ["a 503 that isn't JSON", () => new Response("Bad gateway", { status: 503 })],
  ["a 429", tooManyRequests],
  ["no answer", noAnswer],
];

function urlOf(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

// apiFetch sends a body as a JSON string, or none at all.
function sentBody(init: RequestInit | undefined): string {
  if (init?.body === undefined) return "no-body";
  return typeof init.body === "string" ? init.body : "a body that isn't a string";
}

/** Each call to Nest as "URL body", in order. */
function nestCalls(): string[] {
  return fetchMock.mock.calls.map(([input, init]) => `${urlOf(input)} ${sentBody(init)}`);
}

function refreshCallWith(refreshToken: string) {
  return `${REFRESH} ${JSON.stringify({ refreshToken })}`;
}

function cookieOptions(path: string, maxAge: number) {
  return { httpOnly: true, secure: true, sameSite: "lax", path, maxAge };
}

function expectBothCookiesCleared() {
  expect(cookieStore.set.mock.calls).toEqual([
    ["__Host-session", "", cookieOptions("/", 0)],
    ["__Secure-refresh", "", cookieOptions("/api/auth", 0)],
  ]);
  expect(cookieStore.delete).not.toHaveBeenCalled();
}

// The refresh token wasn't spent, so it stays for the next try.
function expectOnlySessionCookieCleared() {
  expect(cookieStore.set.mock.calls).toEqual([["__Host-session", "", cookieOptions("/", 0)]]);
  expect(cookieStore.delete).not.toHaveBeenCalled();
}

function expectFreshPairSaved() {
  expect(cookieStore.set.mock.calls).toEqual([
    ["__Host-session", FRESH_PAIR.accessToken, cookieOptions("/", SEVEN_DAYS)],
    ["__Secure-refresh", FRESH_PAIR.refreshToken, cookieOptions("/api/auth", SEVEN_DAYS)],
  ]);
  expect(cookieStore.delete).not.toHaveBeenCalled();
}

function expectNoCookieTouched() {
  expect(cookies).not.toHaveBeenCalled();
  expect(cookieStore.set).not.toHaveBeenCalled();
  expect(cookieStore.delete).not.toHaveBeenCalled();
}

// Every answer carries Set-Cookie, so no cache may keep one (SEC-4, AUTH-8
// review round 1).
function expectSeeOther(response: Response, location: string) {
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(location);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.body).toBeNull();
}

function expectStatusOnly(response: Response, status: number) {
  expect(response.status).toBe(status);
  expect(response.headers.get("location")).toBeNull();
  expect(response.headers.get("cache-control")).toBe("no-store");
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
  vi.stubGlobal("fetch", fetchMock);
  cookies.mockResolvedValue(cookieStore);
  savedCookies({});
  vi.resetModules();
  route = await import("./route");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("the module", () => {
  it("exports GET and POST and no other method, so Next answers 405 to the rest", () => {
    expect(typeof route.GET).toBe("function");
    expect(typeof route.POST).toBe("function");
    for (const method of ["HEAD", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      expect(route).not.toHaveProperty(method);
    }
  });
});

describe("GET, a navigation sent here by proxy", () => {
  describe("on success", () => {
    it("swaps the refresh token once, saves the fresh pair and goes to next", async () => {
      signedIn();
      nestGives(refreshed);

      const response = await route.GET(getWithNext("/feed"));

      expect(nestCalls()).toEqual([refreshCallWith(REFRESH_TOKEN)]);
      expectFreshPairSaved();
      expectSeeOther(response, "/feed");
    });

    it("keeps the query of a safe next", async () => {
      signedIn();
      nestGives(refreshed);

      const response = await route.GET(getWithNext("/profiles/e2e-dude?tab=games"));

      expectSeeOther(response, "/profiles/e2e-dude?tab=games");
    });

    // A client-side navigation reaches the handler with Next's own `_rsc`
    // query. Only `next` counts. Next adds `_rsc` back itself.
    it("reads only next, so _rsc never reaches the Location", async () => {
      signedIn();
      nestGives(refreshed);

      const response = await route.GET(getRequest("next=%2Ffeed&_rsc=abc"));

      expectSeeOther(response, "/feed");
    });

    it.each([
      ["no next", getRequest()],
      ["an empty next", getRequest("next=")],
      ["another origin", getWithNext("https://evil.example.com")],
      ["a protocol-relative next", getWithNext("//evil.example.com/feed")],
      ["a next under /api", getWithNext("/api/auth/refresh")],
      ["a backslash trick", getWithNext("/\\evil.example.com")],
    ])("lands on /feed with %s", async (_what, request) => {
      signedIn();
      nestGives(refreshed);

      const response = await route.GET(request);

      expectFreshPairSaved();
      expectSeeOther(response, "/feed");
    });

    it("sends two requests that arrive together to Nest once, and saves the pair for both", async () => {
      signedIn();
      let answer!: (response: Response) => void;
      fetchMock.mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            answer = resolve;
          }),
      );

      const first = route.GET(getWithNext("/feed"));
      const second = route.GET(getWithNext("/hashtags"));
      // Let both reach refreshOnce before Nest answers.
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      answer(refreshed());
      const responses = await Promise.all([first, second]);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expectSeeOther(responses[0], "/feed");
      expectSeeOther(responses[1], "/hashtags");
      const saved = cookieStore.set.mock.calls.map(([name, value]) => `${name}=${value}`);
      expect(saved).toEqual([
        `__Host-session=${FRESH_PAIR.accessToken}`,
        `__Secure-refresh=${FRESH_PAIR.refreshToken}`,
        `__Host-session=${FRESH_PAIR.accessToken}`,
        `__Secure-refresh=${FRESH_PAIR.refreshToken}`,
      ]);
    });
  });

  // SEC-1 (owasp-hacker, AUTH-8 review round 1). Proxy sends a navigation
  // here only when `__Host-session` is there, so a GET without it never comes
  // from proxy. It can come from a cross-site top-level navigation, which
  // SameSite=Lax lets through, carrying a refresh cookie that a sibling
  // subdomain planted: `__Secure-` allows a Domain attribute, `__Host-`
  // doesn't. Swapping that token would sign the browser in to the attacker's
  // account. So GET treats a missing session cookie as signed out.
  describe("with no session cookie", () => {
    it.each([
      ["no session cookie", { "__Secure-refresh": REFRESH_TOKEN }],
      ["an empty session cookie", { "__Host-session": "", "__Secure-refresh": REFRESH_TOKEN }],
    ])(
      "with %s: calls no API, saves no session, clears both cookies and goes to sign-in",
      async (_what, saved) => {
        savedCookies(saved);
        nestGives(refreshed);

        const response = await route.GET(
          new NextRequest(`${APP_ORIGIN}/api/auth/refresh?next=%2Ffeed`, {
            headers: { host: "localhost:3001", "sec-fetch-site": "cross-site" },
          }),
        );

        expect(fetchMock).not.toHaveBeenCalled();
        expectBothCookiesCleared();
        expectSeeOther(response, "/login?next=%2Ffeed");
      },
    );
  });

  describe("with no refresh cookie", () => {
    it.each([
      ["no cookies at all", {}],
      ["only a session cookie", { "__Host-session": ACCESS_TOKEN }],
      [
        "a refresh cookie that isn't shaped like Nest's",
        { "__Host-session": ACCESS_TOKEN, "__Secure-refresh": "not-a-refresh-token" },
      ],
    ])("with %s: clears both cookies, calls no API and goes to sign-in", async (_what, saved) => {
      savedCookies(saved);

      const response = await route.GET(getWithNext("/feed"));

      expect(fetchMock).not.toHaveBeenCalled();
      expectBothCookiesCleared();
      expectSeeOther(response, "/login?next=%2Ffeed");
    });
  });

  describe("when Nest refuses the refresh token with a 401", () => {
    it.each([
      ["invalid", "Refresh token invalid"],
      ["expired", "Refresh token expired"],
      ["reused", "Refresh token reused"],
    ])("(%s): clears both cookies and goes to sign-in", async (_what, message) => {
      const { warn, error } = quietConsole();
      signedIn();
      nestGives(() => refused(message));

      const response = await route.GET(getWithNext("/feed"));

      expect(nestCalls()).toEqual([refreshCallWith(REFRESH_TOKEN)]);
      expectBothCookiesCleared();
      expectSeeOther(response, "/login?next=%2Ffeed");
      // An ended sign-in is not a failure of the app.
      expect(warn).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    });

    it("keeps a safe next, query and all, inside the sign-in link", async () => {
      signedIn();
      nestGives(refused);

      const response = await route.GET(getWithNext("/hashtags?sort=new"));

      expectSeeOther(response, `/login?next=${encodeURIComponent("/hashtags?sort=new")}`);
    });

    it.each([
      ["no next", getRequest()],
      ["another origin", getWithNext("https://evil.example.com")],
    ])("with %s, the sign-in link brings the member back to /feed", async (_what, request) => {
      signedIn();
      nestGives(refused);

      const response = await route.GET(request);

      expectSeeOther(response, "/login?next=%2Ffeed");
    });

    it.each([
      ["/login"],
      ["/login?next=%2Ffeed"],
      ["/login/"],
      ["/%6Cogin"],
      ["/signup"],
      ["/signup?x=1"],
    ])("with next=%s, goes to plain /login", async (next) => {
      signedIn();
      nestGives(refused);

      const response = await route.GET(getWithNext(next));

      expectSeeOther(response, "/login");
    });

    it("drops the failure, so the next request asks Nest again", async () => {
      signedIn();
      fetchMock
        .mockImplementationOnce(async () => refused())
        .mockImplementationOnce(async () => refreshed());

      await route.GET(getWithNext("/feed"));
      const response = await route.GET(getWithNext("/feed"));

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expectSeeOther(response, "/feed");
    });
  });

  describe("when Nest is down", () => {
    it.each(NEST_DOWN)(
      "after %s: clears only the session cookie, keeps the refresh cookie and goes to next",
      async (_what, answer) => {
        quietConsole();
        signedIn();
        nestGives(answer);

        const response = await route.GET(getWithNext("/hashtags?sort=new"));

        expect(nestCalls()).toEqual([refreshCallWith(REFRESH_TOKEN)]);
        expectOnlySessionCookieCleared();
        expectSeeOther(response, "/hashtags?sort=new");
      },
    );

    it.each([
      ["no next", getRequest()],
      ["another origin", getWithNext("https://evil.example.com")],
    ])("with %s, goes to /feed", async (_what, request) => {
      quietConsole();
      signedIn();
      nestGives(serverError);

      const response = await route.GET(request);

      expectSeeOther(response, "/feed");
    });

    it("logs the failed call and its status, and never a token or Nest's body", async () => {
      const { warn, error } = quietConsole();
      signedIn();
      nestGives(() =>
        jsonResponse(500, { statusCode: 500, message: `bad ${REFRESH_TOKEN} ${ACCESS_TOKEN}` }),
      );

      await route.GET(getWithNext("/feed"));

      const logged = everythingLogged(warn, error);
      expect(logged).toContain("POST /auth/token/refresh answered 500");
      expect(logged).not.toContain(REFRESH_TOKEN);
      expect(logged).not.toContain(ACCESS_TOKEN);
      expect(logged).not.toContain("bad");
    });

    it("treats API_URL unset, a setup bug, the same way, and logs it", async () => {
      vi.stubEnv("API_URL", "");
      const { error } = quietConsole();
      signedIn();

      const response = await route.GET(getWithNext("/feed"));

      expect(fetchMock).not.toHaveBeenCalled();
      expectOnlySessionCookieCleared();
      expectSeeOther(response, "/feed");
      expect(everythingLogged(error)).toContain("API_URL is not set");
      expect(everythingLogged(error)).not.toContain(REFRESH_TOKEN);
    });
  });
});

// SEC-6 (owasp-hacker, AUTH-8 review round 2). A browser can hold one
// planted `__Secure-refresh` and no copy of its own, for example once its own
// was evicted. The duplicate check can't see that. So the fresh pair must
// belong to the same sign-in as the `__Host-session` it came with, which no
// subdomain can plant: the two access tokens must share a `sid`.
describe("the sign-in check", () => {
  function sessionWith(sessionToken: string) {
    savedCookies({ "__Host-session": sessionToken, "__Secure-refresh": REFRESH_TOKEN });
  }

  it.each([
    ["another sign-in's sid", () => jsonResponse(200, OTHER_PAIR)],
    [
      "no sid",
      () => jsonResponse(200, { ...FRESH_PAIR, accessToken: accessTokenWith({ sub: "7" }) }),
    ],
    [
      "an access token that isn't a JWT",
      () => jsonResponse(200, { ...FRESH_PAIR, accessToken: "not-a-jwt" }),
    ],
  ])(
    "GET: a fresh pair with %s saves nothing, clears both cookies and goes to sign-in",
    async (_what, answer) => {
      const { warn, error } = quietConsole();
      signedIn();
      nestGives(answer);

      const response = await route.GET(getWithNext("/feed"));

      expect(nestCalls()).toEqual([refreshCallWith(REFRESH_TOKEN)]);
      expectBothCookiesCleared();
      expectSeeOther(response, "/login?next=%2Ffeed");
      expect(warn.mock.calls).toEqual([[SID_WARNING]]);
      expect(error).not.toHaveBeenCalled();
      const logged = everythingLogged(warn, error);
      for (const token of [ACCESS_TOKEN, REFRESH_TOKEN, OTHER_PAIR.accessToken]) {
        expect(logged).not.toContain(token);
      }
    },
  );

  it("POST: a fresh pair from another sign-in saves nothing, clears both cookies and answers 401", async () => {
    const { warn } = quietConsole();
    signedIn();
    nestGives(() => jsonResponse(200, OTHER_PAIR));

    const response = await route.POST(postRequest());

    expect(nestCalls()).toEqual([refreshCallWith(REFRESH_TOKEN)]);
    expectBothCookiesCleared();
    expectStatusOnly(response, 401);
    expect(warn.mock.calls).toEqual([[SID_WARNING]]);
  });

  // With no `sid` in the session cookie there is nothing to tie the refresh
  // token to, so Nest isn't asked: the token isn't spent for a pair that
  // would be thrown away. This changes round 1, where a malformed session
  // cookie with a live refresh cookie refreshed and landed signed in.
  it.each([
    ["a malformed session cookie", "not-a-jwt"],
    ["a session token with no sid", accessTokenWith({ sub: "7", exp: 1_800_000_900 })],
    ["a session token with an empty sid", accessTokenWith({ sub: "7", sid: "" })],
  ])(
    "with %s: calls no API, clears both cookies, GET goes to sign-in and POST answers 401",
    async (_what, sessionToken) => {
      const { warn } = quietConsole();
      sessionWith(sessionToken);
      nestGives(refreshed);

      const getResponse = await route.GET(getWithNext("/feed"));
      const postResponse = await route.POST(postRequest());

      expect(fetchMock).not.toHaveBeenCalled();
      expectSeeOther(getResponse, "/login?next=%2Ffeed");
      expectStatusOnly(postResponse, 401);
      expect(cookieStore.set.mock.calls).toEqual([
        ["__Host-session", "", cookieOptions("/", 0)],
        ["__Secure-refresh", "", cookieOptions("/api/auth", 0)],
        ["__Host-session", "", cookieOptions("/", 0)],
        ["__Secure-refresh", "", cookieOptions("/api/auth", 0)],
      ]);
      expect(warn.mock.calls).toEqual([[SID_WARNING], [SID_WARNING]]);
    },
  );

  // The 10-second hold keys a pair by the refresh token alone, so a request
  // that gets a held pair is checked against its own session cookie too.
  it("checks every request, including one that gets a held pair", async () => {
    quietConsole();
    nestGives(refreshed);

    signedIn();
    const first = await route.GET(getWithNext("/feed"));
    sessionWith(accessTokenWith({ sub: "8", sid: OTHER_SID, exp: 1_800_000_900 }));
    cookieStore.set.mockClear();
    const second = await route.GET(getWithNext("/feed"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expectSeeOther(first, "/feed");
    expectBothCookiesCleared();
    expectSeeOther(second, "/login?next=%2Ffeed");
  });
});

// A sibling subdomain can plant its own `__Secure-refresh` with a Domain
// attribute, and the browser then sends both. The planted one comes last,
// and Next reads the last one, so the handler would swap the attacker's
// token and sign this browser in to their account. With the cookie sent
// more than once, the handler uses neither. How the duplicate is counted is
// tested with hasDuplicateRefreshCookie in lib/session.spec.ts.
describe("a refresh cookie sent more than once", () => {
  const PLANTED = "planted-refresh-token-for-tests_0123456789a";
  const ONCE = `__Host-session=${ACCESS_TOKEN}; __Secure-refresh=${REFRESH_TOKEN}`;
  const TWICE = `${ONCE}; __Secure-refresh=${PLANTED}`;

  function getWithCookieHeader(cookie: string) {
    return new NextRequest(`${APP_ORIGIN}/api/auth/refresh?next=%2Ffeed`, {
      headers: { host: "localhost:3001", cookie },
    });
  }

  // What Next's cookie store gives for TWICE: the last value wins.
  function storeReadsLastOne() {
    savedCookies({ "__Host-session": ACCESS_TOKEN, "__Secure-refresh": PLANTED });
  }

  it("GET: calls no API, clears both cookies, goes to sign-in and warns without a value", async () => {
    const { warn, error } = quietConsole();
    storeReadsLastOne();
    nestGives(refreshed);

    const response = await route.GET(getWithCookieHeader(TWICE));

    expect(fetchMock).not.toHaveBeenCalled();
    expectBothCookiesCleared();
    expectSeeOther(response, "/login?next=%2Ffeed");
    expect(warn.mock.calls).toEqual([
      ["Refresh: refused, the refresh cookie was sent more than once."],
    ]);
    expect(error).not.toHaveBeenCalled();
    const logged = everythingLogged(warn, error);
    expect(logged).not.toContain(PLANTED);
    expect(logged).not.toContain(REFRESH_TOKEN);
  });

  it("POST: calls no API, clears both cookies and answers 401", async () => {
    const { warn } = quietConsole();
    storeReadsLastOne();
    nestGives(refreshed);

    const response = await route.POST(postRequest({ origin: APP_ORIGIN, cookie: TWICE }));

    expect(fetchMock).not.toHaveBeenCalled();
    expectBothCookiesCleared();
    expectStatusOnly(response, 401);
    expect(warn.mock.calls).toEqual([
      ["Refresh: refused, the refresh cookie was sent more than once."],
    ]);
  });

  it("POST from another origin still answers 403 first, touching no cookie", async () => {
    storeReadsLastOne();

    const response = await route.POST(
      postRequest({ origin: "https://evil.example.com", cookie: TWICE }),
    );

    expectStatusOnly(response, 403);
    expectNoCookieTouched();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes as normal, on GET and POST, with the cookie sent once", async () => {
    const { warn } = quietConsole();
    signedIn();
    nestGives(refreshed);

    const getResponse = await route.GET(getWithCookieHeader(ONCE));
    const postResponse = await route.POST(postRequest({ origin: APP_ORIGIN, cookie: ONCE }));

    expect(nestCalls()).toEqual([refreshCallWith(REFRESH_TOKEN)]);
    expectSeeOther(getResponse, "/feed");
    expectStatusOnly(postResponse, 204);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("POST, the browser's fetch wrapper", () => {
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

      const response = await route.POST(postRequest(headers));

      expectStatusOnly(response, 403);
      expect(response.headers.get("set-cookie")).toBeNull();
      expectNoCookieTouched();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it("answers 204 on success, with the fresh pair saved", async () => {
    signedIn();
    nestGives(refreshed);

    const response = await route.POST(postRequest());

    expect(nestCalls()).toEqual([refreshCallWith(REFRESH_TOKEN)]);
    expectFreshPairSaved();
    expectStatusOnly(response, 204);
  });

  // POST asks for `__Host-session` too, as GET does. A planted refresh
  // cookie alone must not sign a signed-out visitor in to the attacker's
  // account when the app's own clientFetch, a same-origin caller, refreshes.
  it.each([
    ["no session cookie", { "__Secure-refresh": REFRESH_TOKEN }],
    ["an empty session cookie", { "__Host-session": "", "__Secure-refresh": REFRESH_TOKEN }],
  ])("answers 401 with %s, clears both cookies and calls no API", async (_what, saved) => {
    savedCookies(saved);
    nestGives(refreshed);

    const response = await route.POST(postRequest());

    expect(fetchMock).not.toHaveBeenCalled();
    expectBothCookiesCleared();
    expectStatusOnly(response, 401);
  });

  it("answers 401 with no refresh cookie, clears both cookies and calls no API", async () => {
    savedCookies({ "__Host-session": ACCESS_TOKEN });

    const response = await route.POST(postRequest());

    expect(fetchMock).not.toHaveBeenCalled();
    expectBothCookiesCleared();
    expectStatusOnly(response, 401);
  });

  it("answers 401 when Nest refuses the refresh token, and clears both cookies", async () => {
    signedIn();
    nestGives(refused);

    const response = await route.POST(postRequest());

    expectBothCookiesCleared();
    expectStatusOnly(response, 401);
  });

  it.each(NEST_DOWN)(
    "answers 503 after %s, and clears only the session cookie",
    async (_what, answer) => {
      const { warn, error } = quietConsole();
      signedIn();
      nestGives(answer);

      const response = await route.POST(postRequest());

      expectOnlySessionCookieCleared();
      expectStatusOnly(response, 503);
      expect(everythingLogged(warn, error)).not.toContain(REFRESH_TOKEN);
    },
  );

  it("shares one Nest call with a GET that arrives at the same time", async () => {
    signedIn();
    let answer!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          answer = resolve;
        }),
    );

    const fromPage = route.GET(getWithNext("/feed"));
    const fromFetch = route.POST(postRequest());
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    answer(refreshed());
    const [pageResponse, fetchResponse] = await Promise.all([fromPage, fromFetch]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expectSeeOther(pageResponse, "/feed");
    expectStatusOnly(fetchResponse, 204);
  });
});
