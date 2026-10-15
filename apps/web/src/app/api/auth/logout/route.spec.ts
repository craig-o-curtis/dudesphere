// @vitest-environment node
// A Route Handler runs on the server, so these tests run in Node, with Node's
// own Request, Response and fetch. lib/session.ts and lib/api.ts are the real
// modules: only the cookie store, fetch and API_URL are stand-ins.

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

// Made-up tokens. Nothing here comes from a real sign-in.
// The shapes readSessionCookies accepts: a three-part JWT, and 43 base64url
// characters.
const ACCESS_TOKEN = "eyJhbGciOiJIUzI1NiJ9.access-token-for-tests.signature_for-tests";
const REFRESH_TOKEN = "refresh-token-for-tests_0123456789abcdefABC";

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

/** Everything the handler logged, joined, so a test can look for a token in it. */
function everythingLogged(...spies: { mock: { calls: unknown[][] } }[]): string {
  return spies
    .flatMap((spy) => spy.mock.calls)
    .flat()
    .map((part) => (part instanceof Error ? `${part.message} ${String(part.cause)}` : String(part)))
    .join("\n");
}

beforeEach(() => {
  vi.stubEnv("API_URL", API_URL);
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(cookies).mockResolvedValue(
    cookieStore as unknown as Awaited<ReturnType<typeof cookies>>,
  );
  savedCookies({});
  fetchMock.mockResolvedValue(noContent());
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

describe("a same-origin sign-out", () => {
  it("revokes the refresh cookie's token at Nest, with no Bearer", async () => {
    signedIn();

    await POST(logoutRequest());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${API_URL}/auth/token/revoke`);
    expect(init?.method).toBe("POST");
    expect(typeof init?.body).toBe("string");
    expect(JSON.parse(init?.body as string)).toEqual({ refreshToken: REFRESH_TOKEN });
    expect(new Headers(init?.headers).get("authorization")).toBeNull();
  });

  it("clears both cookies, each at its own path, and answers 303 with Location /", async () => {
    signedIn();

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
    fetchMock.mockImplementation(async () => {
      setCallsWhenNestAnswered = cookieStore.set.mock.calls.length;
      return noContent();
    });

    await POST(logoutRequest());

    expect(setCallsWhenNestAnswered).toBe(0);
    expect(cookieStore.set).toHaveBeenCalledTimes(2);
  });

  it("skips Nest when there is no refresh cookie, and still clears and redirects", async () => {
    savedCookies({ "__Host-session": ACCESS_TOKEN });

    const response = await POST(logoutRequest());

    expect(fetchMock).not.toHaveBeenCalled();
    expectBothCookiesCleared();
    expectSeeOtherToHome(response);
  });

  it("works for a visitor with no cookies at all", async () => {
    const response = await POST(logoutRequest());

    expect(fetchMock).not.toHaveBeenCalled();
    expectBothCookiesCleared();
    expectSeeOtherToHome(response);
  });
});

describe("when Nest fails", () => {
  it.each([
    [
      "a 500",
      () =>
        fetchMock.mockResolvedValue(
          jsonResponse(500, { statusCode: 500, message: "Internal server error" }),
        ),
    ],
    [
      "a 503 that isn't JSON",
      () => fetchMock.mockResolvedValue(new Response("Bad gateway", { status: 503 })),
    ],
    [
      "a 401",
      () =>
        fetchMock.mockResolvedValue(
          jsonResponse(401, { statusCode: 401, message: "Unauthorized" }),
        ),
    ],
    ["no answer", () => fetchMock.mockRejectedValue(new TypeError("fetch failed"))],
  ])("still clears both cookies and answers 303 after %s", async (_what, failNest) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    signedIn();
    failNest();

    const response = await POST(logoutRequest());

    expectBothCookiesCleared();
    expectSeeOtherToHome(response);
  });

  it("logs the failed step and status, and never a token", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    signedIn();
    fetchMock.mockResolvedValue(
      jsonResponse(500, { statusCode: 500, message: `bad token ${REFRESH_TOKEN}` }),
    );

    await POST(logoutRequest());

    const logged = everythingLogged(warn, error);
    expect(logged).toContain("/auth/token/revoke");
    expect(logged).toContain("500");
    expect(logged).not.toContain(REFRESH_TOKEN);
    expect(logged).not.toContain(ACCESS_TOKEN);
  });
});

describe("when API_URL is unset, a bug in the app's setup", () => {
  it("still clears both cookies and answers 303, and logs the setup error", async () => {
    vi.stubEnv("API_URL", "");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    signedIn();

    const response = await POST(logoutRequest());

    expect(fetchMock).not.toHaveBeenCalled();
    expectBothCookiesCleared();
    expectSeeOtherToHome(response);
    expect(everythingLogged(error)).toContain("API_URL is not set");
    expect(everythingLogged(error)).not.toContain(REFRESH_TOKEN);
  });
});
