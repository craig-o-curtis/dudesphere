// @vitest-environment node
// lib/session.ts runs on the server only, so these tests run in Node.

import { readFileSync } from "node:fs";

import type { TokenPair, UserResponse } from "@dudesphere/api-types";
import { getUnixNow } from "@northguild/gmt";
import { io } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { apiFetch, ApiRequestError } from "@/lib/api";

import {
  clearSessionCookies,
  getMe,
  hasDuplicateRefreshCookie,
  readSessionCookies,
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
  REFRESH_MAX_AGE_SECONDS,
  requireSession,
  SESSION_COOKIE,
  startSession,
  verifySession,
} from "./session";

// The real package throws when imported outside a React Server Component
// build. Next resolves it to an empty module on the server; this does the same.
vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

// The real io() hangs while Next prerenders a shell and resolves at once on
// a real request. Here it resolves, as on a request; one test makes it hang.
vi.mock("next/cache", () => ({
  io: vi.fn(() => Promise.resolve()),
}));

// The real redirect throws NEXT_REDIRECT, which ends the render. This throws
// too, so code after it never runs, as in Next.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

// apiFetch is faked. ApiRequestError stays real, so getMe's check on it is real.
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

// Only the clock is faked. Every other gmt export stays real.
vi.mock("@northguild/gmt", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@northguild/gmt")>()),
  getUnixNow: vi.fn(),
}));

// React's cache() needs no mock. Outside a server render, the build Vitest
// loads gives back a plain wrapper that calls the function every time, so
// each test sees fresh cookies. It can't show the per-request dedupe; the
// handoff checks that by hand against the API log.

const cookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};

// Made-up tokens. Nothing here comes from a real sign-in.
const pair: TokenPair = {
  accessToken: "access-token-for-tests",
  refreshToken: "refresh-token-for-tests",
  expiresIn: 900,
};

const SEVEN_DAYS_IN_SECONDS = 60 * 60 * 24 * 7;

// A made-up instant, in epoch seconds, that the faked clock reports.
const NOW = 1_800_000_000;

function base64url(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}

// A made-up JWT with the given exp. The signature is not real: the web app
// never checks it, Nest does.
function accessTokenWith(exp: number): string {
  return `${base64url('{"alg":"HS256","typ":"JWT"}')}.${base64url(`{"sub":"7","exp":${exp}}`)}.signature_for-tests`;
}

// A made-up member, in the shape GET /users/me answers.
const me: UserResponse = {
  id: 7,
  username: "e2e-walter",
  email: "e2e-walter@example.com",
  role: "user",
  createdAt: "2026-10-01T12:00:00.000Z",
  updatedAt: "2026-10-01T12:00:00.000Z",
  profile: null,
};

function savedCookies(values: Record<string, string>) {
  cookieStore.get.mockImplementation((name: string) =>
    Object.hasOwn(values, name) ? { name, value: values[name] } : undefined,
  );
}

function setOptions(call: number): Record<string, unknown> {
  const options = cookieStore.set.mock.calls[call]?.[2] as Record<string, unknown> | undefined;
  if (!options) throw new Error(`set call ${call} had no options`);
  return options;
}

beforeEach(() => {
  vi.mocked(cookies).mockResolvedValue(
    cookieStore as unknown as Awaited<ReturnType<typeof cookies>>,
  );
  vi.mocked(getUnixNow).mockReturnValue(NOW);
  savedCookies({});
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("the module", () => {
  it("starts with import 'server-only', so a client bundle that imports it fails to build", () => {
    const source = readFileSync(new URL("./session.ts", import.meta.url), "utf8");

    expect(source.trimStart().startsWith('import "server-only";')).toBe(true);
  });

  it("exports the cookie names, the refresh path and the refresh lifetime", () => {
    expect(SESSION_COOKIE).toBe("__Host-session");
    expect(REFRESH_COOKIE).toBe("__Secure-refresh");
    expect(REFRESH_COOKIE_PATH).toBe("/api/auth");
    expect(REFRESH_MAX_AGE_SECONDS).toBe(SEVEN_DAYS_IN_SECONDS);
  });

  it("never uses expires, which takes a Date", () => {
    const source = readFileSync(new URL("./session.ts", import.meta.url), "utf8");

    expect(source).not.toMatch(/\bexpires\s*:/);
    expect(source).not.toMatch(/\bDate\b/);
  });
});

describe("startSession", () => {
  it("sets the session cookie, then the refresh cookie, both for 7 days, with every option", async () => {
    await startSession(pair, "/");

    expect(cookieStore.set).toHaveBeenCalledTimes(2);
    expect(cookieStore.set).toHaveBeenNthCalledWith(1, "__Host-session", pair.accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: SEVEN_DAYS_IN_SECONDS,
    });
    expect(cookieStore.set).toHaveBeenNthCalledWith(2, "__Secure-refresh", pair.refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/api/auth",
      maxAge: SEVEN_DAYS_IN_SECONDS,
    });
    expect(cookieStore.delete).not.toHaveBeenCalled();
  });

  it("passes no domain and no expires, so the __Host- prefix holds and maxAge alone sets the lifetime", async () => {
    await startSession(pair, "/");

    for (const call of [0, 1]) {
      const options = setOptions(call);
      expect(Object.keys(options)).not.toContain("domain");
      expect(Object.keys(options)).not.toContain("expires");
    }
  });

  // The access token inside still expires when Nest says. The cookie outlives
  // it so that proxy can tell a member whose token ran out from a visitor.
  it.each<[string, unknown]>([
    ["900", 900],
    ["600", 600],
    ["a fraction", 899.7],
    ["zero", 0],
    ["a negative number", -60],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["a string", "900"],
    ["null", null],
    ["undefined", undefined],
  ])("gives the session cookie 7 days when expiresIn is %s", async (_label, expiresIn) => {
    await startSession({ ...pair, expiresIn } as unknown as TokenPair, "/");

    expect(setOptions(0).maxAge).toBe(SEVEN_DAYS_IN_SECONDS);
    expect(setOptions(1).maxAge).toBe(SEVEN_DAYS_IN_SECONDS);
  });

  it.each([
    ["/", "/"],
    ["/games/42", "/games/42"],
    ["/feed?tab=new#top", "/feed?tab=new#top"],
  ])("returns the safe path %s", async (next, expected) => {
    await expect(startSession(pair, next)).resolves.toBe(expected);
  });

  it.each<[string, unknown]>([
    ["another origin", "https://evil.example.com/"],
    ["a protocol-relative URL", "//evil.example.com"],
    ["a path under /api", "/api/auth/logout"],
    ["a relative path", "games"],
    ["an empty string", ""],
    ["undefined", undefined],
    ["null", null],
    ["a number", 42],
    ["an object", { next: "/games" }],
  ])("returns / for %s", async (_label, next) => {
    await expect(startSession(pair, next)).resolves.toBe("/");
  });

  it("sets both cookies even when next is unsafe", async () => {
    await startSession(pair, "https://evil.example.com/");

    expect(cookieStore.set).toHaveBeenCalledTimes(2);
  });

  it.each<[string, unknown]>([
    ["another origin", "https://evil.example.com/"],
    ["a protocol-relative URL", "//evil.example.com"],
    ["a path under /api", "/api/auth/refresh"],
    ["undefined", undefined],
    ["an empty string", ""],
  ])("returns the fallback it is given for %s", async (_label, next) => {
    await expect(startSession(pair, next, "/feed")).resolves.toBe("/feed");
  });

  it("returns a safe next over the fallback", async () => {
    await expect(startSession(pair, "/games/42?tab=new", "/feed")).resolves.toBe(
      "/games/42?tab=new",
    );
  });

  it("sets the same two cookies when a fallback is passed", async () => {
    await startSession(pair, undefined, "/feed");

    expect(cookieStore.set).toHaveBeenCalledTimes(2);
    expect(setOptions(0)).toMatchObject({ path: "/", maxAge: SEVEN_DAYS_IN_SECONDS });
    expect(setOptions(1)).toMatchObject({ path: "/api/auth", maxAge: SEVEN_DAYS_IN_SECONDS });
  });
});

describe("clearSessionCookies", () => {
  it("clears each cookie at its own path, with an empty value and maxAge 0", async () => {
    await clearSessionCookies();

    expect(cookieStore.set).toHaveBeenCalledTimes(2);
    expect(cookieStore.set).toHaveBeenCalledWith("__Host-session", "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    expect(cookieStore.set).toHaveBeenCalledWith("__Secure-refresh", "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/api/auth",
      maxAge: 0,
    });
  });

  it("never calls delete, whose name-only form clears only the cookie at /", async () => {
    await clearSessionCookies();

    expect(cookieStore.delete).not.toHaveBeenCalled();
  });

  it("passes no domain and no expires", async () => {
    await clearSessionCookies();

    for (const call of [0, 1]) {
      const options = setOptions(call);
      expect(Object.keys(options)).not.toContain("domain");
      expect(Object.keys(options)).not.toContain("expires");
    }
  });

  it("clears even when no cookie is saved", async () => {
    await clearSessionCookies();

    expect(cookieStore.get).not.toHaveBeenCalled();
    expect(cookieStore.set).toHaveBeenCalledTimes(2);
  });
});

describe("readSessionCookies", () => {
  // Made-up tokens in the shapes Nest issues: a JWT of three base64url parts,
  // and a refresh token of 43 base64url characters (32 random bytes).
  const ACCESS = "eyJhbGciOiJIUzI1NiJ9.access-token-for-tests.signature_for-tests";
  const REFRESH = "refresh-token-for-tests_0123456789abcdefABC";

  it("has fixtures in the shapes it accepts", () => {
    expect(REFRESH).toHaveLength(43);
  });

  it("returns null for both when neither cookie is saved", async () => {
    await expect(readSessionCookies()).resolves.toEqual({
      accessToken: null,
      refreshToken: null,
    });
  });

  it("returns the access token when only the session cookie is saved", async () => {
    savedCookies({ "__Host-session": ACCESS });

    await expect(readSessionCookies()).resolves.toEqual({
      accessToken: ACCESS,
      refreshToken: null,
    });
  });

  it("returns the refresh token when only the refresh cookie is saved", async () => {
    savedCookies({ "__Secure-refresh": REFRESH });

    await expect(readSessionCookies()).resolves.toEqual({
      accessToken: null,
      refreshToken: REFRESH,
    });
  });

  it("returns both tokens when both cookies are saved", async () => {
    savedCookies({ "__Host-session": ACCESS, "__Secure-refresh": REFRESH });

    await expect(readSessionCookies()).resolves.toEqual({
      accessToken: ACCESS,
      refreshToken: REFRESH,
    });
  });

  it("accepts a JWT with an empty signature part, as the shape allows", async () => {
    savedCookies({ "__Host-session": "eyJhbGciOiJub25lIn0.e30." });

    await expect(readSessionCookies()).resolves.toMatchObject({
      accessToken: "eyJhbGciOiJub25lIn0.e30.",
    });
  });

  it("counts an empty cookie as missing", async () => {
    savedCookies({ "__Host-session": "", "__Secure-refresh": "" });

    await expect(readSessionCookies()).resolves.toEqual({
      accessToken: null,
      refreshToken: null,
    });
  });

  // Headers.set throws on CR, LF and NUL, so a token like these would make
  // the call to Nest fail before it is sent.
  it.each([
    ["a carriage return", `${ACCESS}\r`],
    ["a line feed", `${ACCESS}\nX-Evil: 1`],
    ["a NUL", `${ACCESS}\u0000`],
    ["a line separator", `${ACCESS}\u2028`],
    ["a space", `Bearer ${ACCESS}`],
    ["two parts", "eyJhbGciOiJIUzI1NiJ9.access-token-for-tests"],
    ["four parts", `${ACCESS}.extra`],
    ["an empty header part", ".access-token-for-tests.signature"],
    ["an empty payload part", "eyJhbGciOiJIUzI1NiJ9..signature"],
    ["plain base64 characters", "eyJhbGci+OiJ9.access/token.sig=="],
    ["no dots at all", "access-token-for-tests"],
  ])("counts an access token with %s as missing", async (_what, value) => {
    savedCookies({ "__Host-session": value, "__Secure-refresh": REFRESH });

    await expect(readSessionCookies()).resolves.toEqual({
      accessToken: null,
      refreshToken: REFRESH,
    });
  });

  it.each([
    ["a carriage return", `${REFRESH.slice(0, 42)}\r`],
    ["a line feed", `${REFRESH.slice(0, 42)}\n`],
    ["a NUL", `${REFRESH.slice(0, 42)}\u0000`],
    ["a line separator", `${REFRESH.slice(0, 42)}\u2028`],
    ["one character too few", REFRESH.slice(0, 42)],
    ["one character too many", `${REFRESH}A`],
    ["a dot", `${REFRESH.slice(0, 42)}.`],
    ["a plain base64 character", `${REFRESH.slice(0, 42)}+`],
    ["a padding character", `${REFRESH.slice(0, 42)}=`],
    ["the access token's shape", ACCESS],
  ])("counts a refresh token with %s as missing", async (_what, value) => {
    savedCookies({ "__Host-session": ACCESS, "__Secure-refresh": value });

    await expect(readSessionCookies()).resolves.toEqual({
      accessToken: ACCESS,
      refreshToken: null,
    });
  });

  it("ignores cookies without the prefix, which any subdomain or plain-HTTP page could set", async () => {
    savedCookies({ session: ACCESS, refresh: REFRESH });

    await expect(readSessionCookies()).resolves.toEqual({
      accessToken: null,
      refreshToken: null,
    });
  });

  it("only reads, and writes nothing", async () => {
    savedCookies({ "__Host-session": ACCESS });

    await readSessionCookies();

    expect(cookieStore.set).not.toHaveBeenCalled();
    expect(cookieStore.delete).not.toHaveBeenCalled();
  });
});

// A sibling subdomain can plant its own `__Secure-refresh` with a Domain
// attribute, and the browser then sends both. Next's cookie store keeps only
// the last one, so only the raw Cookie header shows the duplicate.
describe("hasDuplicateRefreshCookie", () => {
  // Made-up values. Neither comes from a real sign-in.
  const OURS = "refresh-token-for-tests_0123456789abcdefABC";
  const PLANTED = "planted-refresh-token-for-tests_0123456789a";

  function requestWithCookie(cookie?: string): Request {
    return new Request("http://localhost:3001/api/auth/refresh", {
      headers: cookie === undefined ? {} : { cookie },
    });
  }

  it.each<[string, string]>([
    ["twice", `__Host-session=a.b.c; __Secure-refresh=${OURS}; __Secure-refresh=${PLANTED}`],
    ["twice, without spaces", `__Secure-refresh=${OURS};__Secure-refresh=${PLANTED}`],
    [
      "three times",
      `__Secure-refresh=${OURS}; __Host-session=a.b.c; __Secure-refresh=${PLANTED}; __Secure-refresh=${PLANTED}`,
    ],
    ["twice, once with an empty value", `__Secure-refresh=; __Secure-refresh=${PLANTED}`],
    [
      "twice, with spaces around the names",
      `  __Secure-refresh=${OURS} ;  __Secure-refresh=${PLANTED}`,
    ],
  ])("is true with the cookie sent %s", (_what, cookie) => {
    expect(hasDuplicateRefreshCookie(requestWithCookie(cookie))).toBe(true);
  });

  it.each<[string, string | undefined]>([
    ["no Cookie header", undefined],
    ["an empty Cookie header", ""],
    ["only the session cookie", "__Host-session=a.b.c"],
    ["the cookie once", `__Host-session=a.b.c; __Secure-refresh=${OURS}`],
    [
      "once, beside a name that ends with it",
      `x__Secure-refresh=${PLANTED}; __Secure-refresh=${OURS}`,
    ],
    [
      "once, beside a name that starts with it",
      `__Secure-refresh2=${PLANTED}; __Secure-refresh=${OURS}`,
    ],
    [
      "once, beside a value that holds its name",
      `note=__Secure-refresh=${PLANTED}; __Secure-refresh=${OURS}`,
    ],
    [
      "once, beside a cookie with no name whose value is its name",
      `__Secure-refresh; __Secure-refresh=${OURS}`,
    ],
    [
      "once, beside a name in another case",
      `__secure-refresh=${PLANTED}; __Secure-refresh=${OURS}`,
    ],
  ])("is false with %s", (_what, cookie) => {
    expect(hasDuplicateRefreshCookie(requestWithCookie(cookie))).toBe(false);
  });

  it("reads the request only, never Next's cookie store", () => {
    hasDuplicateRefreshCookie(requestWithCookie(`__Secure-refresh=${OURS}`));

    expect(cookies).not.toHaveBeenCalled();
  });
});

describe("verifySession", () => {
  it("gives null when there is no session cookie", async () => {
    await expect(verifySession()).resolves.toBeNull();
  });

  it.each<[string, string]>([
    ["isn't shaped like a JWT", "not-a-jwt"],
    [
      "has a payload that isn't JSON",
      "eyJhbGciOiJIUzI1NiJ9.access-token-for-tests.signature_for-tests",
    ],
    [
      "has no exp",
      `${base64url('{"alg":"HS256"}')}.${base64url('{"sub":"7"}')}.signature_for-tests`,
    ],
    [
      "has a string exp",
      `${base64url('{"alg":"HS256"}')}.${base64url(`{"exp":"${NOW + 600}"}`)}.signature_for-tests`,
    ],
  ])("gives null when the token %s", async (_label, token) => {
    savedCookies({ "__Host-session": token });

    await expect(verifySession()).resolves.toBeNull();
  });

  it.each<[string, number]>([
    ["at exp", 0],
    ["a second after exp", -1],
    ["a day after exp", -86_400],
  ])("gives null %s", async (_label, secondsLeft) => {
    savedCookies({ "__Host-session": accessTokenWith(NOW + secondsLeft) });

    await expect(verifySession()).resolves.toBeNull();
  });

  // Proxy refreshes inside the last 60 seconds. Here a token is good until
  // it has actually expired.
  it.each<[string, number]>([
    ["a second before exp", 1],
    ["30 seconds before exp", 30],
    ["15 minutes before exp", 900],
  ])("gives the token and its exp %s", async (_label, secondsLeft) => {
    const token = accessTokenWith(NOW + secondsLeft);
    savedCookies({ "__Host-session": token });

    await expect(verifySession()).resolves.toEqual({ accessToken: token, exp: NOW + secondsLeft });
  });

  it("awaits io() before it reads the clock", async () => {
    savedCookies({ "__Host-session": accessTokenWith(NOW + 600) });

    await verifySession();

    expect(io).toHaveBeenCalledTimes(1);
    expect(getUnixNow).toHaveBeenCalledTimes(1);
    const ioOrder = vi.mocked(io).mock.invocationCallOrder[0] ?? Infinity;
    const clockOrder = vi.mocked(getUnixNow).mock.invocationCallOrder[0] ?? -Infinity;
    expect(ioOrder).toBeLessThan(clockOrder);
  });

  // While Next prerenders a shell, io() never resolves. The clock must not be
  // read before that, or Next logs "encountered the unstable value".
  it("never reads the clock while io() hangs", async () => {
    savedCookies({ "__Host-session": accessTokenWith(NOW + 600) });
    vi.mocked(io).mockReturnValueOnce(new Promise<void>(() => {}));

    const settled = await Promise.race([
      verifySession().then(() => "settled"),
      new Promise((resolve) => setTimeout(resolve, 20, "pending")),
    ]);

    expect(settled).toBe("pending");
    expect(getUnixNow).not.toHaveBeenCalled();
  });

  it.each<[string, Record<string, string>]>([
    ["no session cookie", {}],
    ["a token that isn't shaped like a JWT", { "__Host-session": "not-a-jwt" }],
    [
      "a token with no exp",
      {
        "__Host-session": `${base64url('{"alg":"HS256"}')}.${base64url('{"sub":"7"}')}.signature_for-tests`,
      },
    ],
  ])("calls neither io() nor the clock with %s", async (_label, values) => {
    savedCookies(values);

    await expect(verifySession()).resolves.toBeNull();

    expect(io).not.toHaveBeenCalled();
    expect(getUnixNow).not.toHaveBeenCalled();
  });

  it("ignores the refresh cookie", async () => {
    savedCookies({ "__Secure-refresh": "refresh-token-for-tests_0123456789abcdefABC" });

    await expect(verifySession()).resolves.toBeNull();
  });

  it("calls nothing over the network and writes no cookie", async () => {
    savedCookies({ "__Host-session": accessTokenWith(NOW + 600) });

    await verifySession();

    expect(apiFetch).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
    expect(cookieStore.delete).not.toHaveBeenCalled();
  });
});

describe("getMe", () => {
  it("gives null and calls nothing when there is no session", async () => {
    await expect(getMe()).resolves.toBeNull();

    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("gives null and calls nothing when the token has expired", async () => {
    savedCookies({ "__Host-session": accessTokenWith(NOW - 1) });

    await expect(getMe()).resolves.toBeNull();

    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("asks Nest for /users/me with the token, and gives the member on 200", async () => {
    const token = accessTokenWith(NOW + 600);
    savedCookies({ "__Host-session": token });
    vi.mocked(apiFetch).mockResolvedValue(me);

    await expect(getMe()).resolves.toEqual(me);

    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith("/users/me", { token });
  });

  it("gives null when Nest answers 401", async () => {
    savedCookies({ "__Host-session": accessTokenWith(NOW + 600) });
    vi.mocked(apiFetch).mockRejectedValue(
      new ApiRequestError("GET /users/me answered 401", { status: 401 }),
    );

    await expect(getMe()).resolves.toBeNull();
  });

  it.each<[string, number]>([
    ["403", 403],
    ["429", 429],
    ["500", 500],
    ["503", 503],
    ["no answer", 0],
  ])("rethrows when Nest answers %s", async (_label, status) => {
    savedCookies({ "__Host-session": accessTokenWith(NOW + 600) });
    const error = new ApiRequestError(`GET /users/me answered ${status}`, { status });
    vi.mocked(apiFetch).mockRejectedValue(error);

    await expect(getMe()).rejects.toBe(error);
  });

  it("rethrows an error that isn't an ApiRequestError", async () => {
    savedCookies({ "__Host-session": accessTokenWith(NOW + 600) });
    const error = new Error("API_URL is not set.");
    vi.mocked(apiFetch).mockRejectedValue(error);

    await expect(getMe()).rejects.toBe(error);
  });
});

describe("requireSession", () => {
  it.each<[string, string, string]>([
    ["a plain path", "/feed", "/login?next=%2Ffeed"],
    [
      "a path with a query",
      "/games/42?tab=new&x=1",
      "/login?next=%2Fgames%2F42%3Ftab%3Dnew%26x%3D1",
    ],
    ["the root path", "/", "/login"],
  ])("redirects to sign-in with %s kept as next", async (_label, next, target) => {
    await expect(requireSession(next)).rejects.toThrow(`NEXT_REDIRECT ${target}`);

    expect(redirect).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith(target);
  });

  it("redirects when the token has expired", async () => {
    savedCookies({ "__Host-session": accessTokenWith(NOW) });

    await expect(requireSession("/feed")).rejects.toThrow("NEXT_REDIRECT /login?next=%2Ffeed");
  });

  it("gives the session and doesn't redirect when the token is live", async () => {
    const token = accessTokenWith(NOW + 600);
    savedCookies({ "__Host-session": token });

    await expect(requireSession("/feed")).resolves.toEqual({ accessToken: token, exp: NOW + 600 });

    expect(redirect).not.toHaveBeenCalled();
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
