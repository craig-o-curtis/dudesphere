// @vitest-environment node
// A Route Handler runs on the server, so these tests run in Node, with Node's
// own Request, Response and fetch. lib/session.ts and lib/api.ts are the real
// modules: only the cookie store, fetch and API_URL are stand-ins.

import type { TokenPair } from "@dudesphere/api-types";
import { cookies } from "next/headers";

import * as route from "./route";
import { POST } from "./route";

// The real package throws when imported outside a React Server Component
// build. Next resolves it to an empty module on the server; this does the same.
vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

const API_URL = "http://api.example.com";
const APP_ORIGIN = "http://localhost:3001";

// Made-up tokens. Nothing here comes from a real sign-in. The two read from
// cookies have the shapes readSessionCookies accepts: a three-part JWT, and
// 43 base64url characters.
const ACCESS_TOKEN = "eyJhbGciOiJIUzI1NiJ9.access-token-for-tests.signature_for-tests";
const REFRESH_TOKEN = "refresh-token-for-tests_0123456789abcdefABC";
const FRESH_PAIR: TokenPair = {
  accessToken: "fresh-access-token-for-tests",
  refreshToken: "fresh-refresh-token-for-tests",
  expiresIn: 900,
};

const SIGN_OUT_EVERYWHERE = `${API_URL}/auth/sign-out-everywhere`;
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

function revokeWith(refreshToken: string) {
  return `${REVOKE} no-bearer ${JSON.stringify({ refreshToken })}`;
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

beforeEach(() => {
  vi.stubEnv("API_URL", API_URL);
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(cookies).mockResolvedValue(
    cookieStore as unknown as Awaited<ReturnType<typeof cookies>>,
  );
  savedCookies({});
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

describe("with no access token", () => {
  it("swaps the refresh token first, then signs out with the fresh access token", async () => {
    savedCookies({ "__Secure-refresh": REFRESH_TOKEN });
    nestAnswers({
      [REFRESH]: [() => jsonResponse(200, FRESH_PAIR)],
      [SIGN_OUT_EVERYWHERE]: [noContent],
    });

    const response = await POST(logoutEverywhereRequest());

    expect(nestCalls()).toEqual([
      refreshWith(REFRESH_TOKEN),
      signOutEverywhereWith(FRESH_PAIR.accessToken),
    ]);
    expectBothCookiesCleared();
    expectSeeOtherToHome(response);
  });

  it("never writes the fresh pair to a cookie", async () => {
    savedCookies({ "__Secure-refresh": REFRESH_TOKEN });
    nestAnswers({
      [REFRESH]: [() => jsonResponse(200, FRESH_PAIR)],
      [SIGN_OUT_EVERYWHERE]: [noContent],
    });

    await POST(logoutEverywhereRequest());

    const written = cookieStore.set.mock.calls.map(([, value]) => value);
    expect(written).toEqual(["", ""]);
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

  it("gives up after the second 401, with no second refresh", async () => {
    quietConsole();
    signedIn();
    nestAnswers({
      [SIGN_OUT_EVERYWHERE]: [unauthorized, unauthorized],
      [REFRESH]: [() => jsonResponse(200, FRESH_PAIR)],
      [REVOKE]: [noContent],
    });

    const response = await POST(logoutEverywhereRequest());

    expect(nestCalls()).toEqual([
      signOutEverywhereWith(ACCESS_TOKEN),
      refreshWith(REFRESH_TOKEN),
      signOutEverywhereWith(FRESH_PAIR.accessToken),
      revokeWith(REFRESH_TOKEN),
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
    [
      "with no access token",
      { "__Secure-refresh": REFRESH_TOKEN },
      { [REFRESH]: [unauthorized] },
      [refreshWith(REFRESH_TOKEN)],
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
      [REVOKE]: [noContent],
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

describe("the fallback revoke, when signing out everywhere fails", () => {
  type Answer = () => Response | Promise<Response>;

  // Each way the sign-out-everywhere step can fail with a refresh cookie
  // present: what Nest answers, and the calls made before the fallback.
  const failures: [string, Record<string, Answer[]>, string[]][] = [
    [
      "a 500 to the access token",
      { [SIGN_OUT_EVERYWHERE]: [serverError] },
      [signOutEverywhereWith(ACCESS_TOKEN)],
    ],
    [
      "a 503 that isn't JSON",
      { [SIGN_OUT_EVERYWHERE]: [() => new Response("Bad gateway", { status: 503 })] },
      [signOutEverywhereWith(ACCESS_TOKEN)],
    ],
    [
      "a 403 to the access token",
      {
        [SIGN_OUT_EVERYWHERE]: [() => jsonResponse(403, { statusCode: 403, message: "Forbidden" })],
      },
      [signOutEverywhereWith(ACCESS_TOKEN)],
    ],
    [
      "no answer to the access token",
      { [SIGN_OUT_EVERYWHERE]: [noAnswer] },
      [signOutEverywhereWith(ACCESS_TOKEN)],
    ],
    [
      "a refresh that gets a 429 after a 401",
      {
        [SIGN_OUT_EVERYWHERE]: [unauthorized],
        [REFRESH]: [() => jsonResponse(429, { statusCode: 429, message: "Too many requests" })],
      },
      [signOutEverywhereWith(ACCESS_TOKEN), refreshWith(REFRESH_TOKEN)],
    ],
    [
      "a refresh that gets no answer after a 401",
      { [SIGN_OUT_EVERYWHERE]: [unauthorized], [REFRESH]: [noAnswer] },
      [signOutEverywhereWith(ACCESS_TOKEN), refreshWith(REFRESH_TOKEN)],
    ],
    [
      "a refresh that gets a 400 after a 401",
      {
        [SIGN_OUT_EVERYWHERE]: [unauthorized],
        [REFRESH]: [() => jsonResponse(400, { statusCode: 400, message: ["bad"] })],
      },
      [signOutEverywhereWith(ACCESS_TOKEN), refreshWith(REFRESH_TOKEN)],
    ],
    [
      "a refresh that gets a 500 after a 401",
      { [SIGN_OUT_EVERYWHERE]: [unauthorized], [REFRESH]: [serverError] },
      [signOutEverywhereWith(ACCESS_TOKEN), refreshWith(REFRESH_TOKEN)],
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
    ],
  ];

  it.each(failures)(
    "revokes the refresh cookie's token once after %s, then clears and redirects",
    async (_what, plan, before) => {
      quietConsole();
      signedIn();
      nestAnswers({ ...plan, [REVOKE]: [noContent] });

      const response = await POST(logoutEverywhereRequest());

      expect(nestCalls()).toEqual([...before, revokeWith(REFRESH_TOKEN)]);
      expectBothCookiesCleared();
      expectPartialSignOut(response);
    },
  );

  it("revokes after a refresh that fails with no access token at all", async () => {
    quietConsole();
    savedCookies({ "__Secure-refresh": REFRESH_TOKEN });
    nestAnswers({ [REFRESH]: [serverError], [REVOKE]: [noContent] });

    const response = await POST(logoutEverywhereRequest());

    expect(nestCalls()).toEqual([refreshWith(REFRESH_TOKEN), revokeWith(REFRESH_TOKEN)]);
    expectBothCookiesCleared();
    expectPartialSignOut(response);
  });

  it.each([
    [
      "with the access token",
      { [SIGN_OUT_EVERYWHERE]: [noContent] },
      { "__Host-session": ACCESS_TOKEN, "__Secure-refresh": REFRESH_TOKEN },
    ],
    [
      "after a refresh with no access token",
      { [REFRESH]: [() => jsonResponse(200, FRESH_PAIR)], [SIGN_OUT_EVERYWHERE]: [noContent] },
      { "__Secure-refresh": REFRESH_TOKEN },
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
    "does not revoke after a success %s, and sends / with no partial flag",
    async (_what, plan, saved) => {
      savedCookies(saved);
      nestAnswers(plan);

      const response = await POST(logoutEverywhereRequest());

      expect(fetchMock.mock.calls.map(([input]) => urlOf(input))).not.toContain(REVOKE);
      expectSeeOtherToHome(response);
    },
  );

  it.each([
    ["a 500", serverError],
    ["no answer", noAnswer],
  ])("does not revoke with no refresh cookie, after %s", async (_what, failure) => {
    quietConsole();
    savedCookies({ "__Host-session": ACCESS_TOKEN });
    nestAnswers({ [SIGN_OUT_EVERYWHERE]: [failure] });

    const response = await POST(logoutEverywhereRequest());

    expect(nestCalls()).toEqual([signOutEverywhereWith(ACCESS_TOKEN)]);
    expectBothCookiesCleared();
    expectPartialSignOut(response);
  });

  it.each([
    ["a 500", serverError],
    ["no answer", noAnswer],
  ])("still clears and answers 303 when the revoke gets %s", async (_what, failure) => {
    quietConsole();
    signedIn();
    nestAnswers({ [SIGN_OUT_EVERYWHERE]: [serverError], [REVOKE]: [failure] });

    const response = await POST(logoutEverywhereRequest());

    expect(nestCalls()).toEqual([signOutEverywhereWith(ACCESS_TOKEN), revokeWith(REFRESH_TOKEN)]);
    expectBothCookiesCleared();
    expectPartialSignOut(response);
  });

  it("clears the cookies only after the revoke has answered", async () => {
    quietConsole();
    signedIn();
    // Counted, not asserted, inside fetch: the handler swallows anything
    // thrown there, so a failed expect would go unseen.
    let setCallsWhenRevokeAnswered = -1;
    nestAnswers({
      [SIGN_OUT_EVERYWHERE]: [serverError],
      [REVOKE]: [
        () => {
          setCallsWhenRevokeAnswered = cookieStore.set.mock.calls.length;
          return noContent();
        },
      ],
    });

    await POST(logoutEverywhereRequest());

    expect(setCallsWhenRevokeAnswered).toBe(0);
    expect(cookieStore.set).toHaveBeenCalledTimes(2);
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
      [REVOKE]: [() => jsonResponse(502, { statusCode: 502, message: `bad ${REFRESH_TOKEN}` })],
    });

    await POST(logoutEverywhereRequest());

    const logged = everythingLogged(warn, error);
    expect(logged).toContain("POST /auth/sign-out-everywhere answered 500");
    expect(logged).toContain("POST /auth/token/revoke answered 502");
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
