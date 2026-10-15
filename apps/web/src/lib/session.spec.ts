// @vitest-environment node
// lib/session.ts runs on the server only, so these tests run in Node.

import { readFileSync } from "node:fs";

import type { TokenPair } from "@dudesphere/api-types";
import { cookies } from "next/headers";

import {
  clearSessionCookies,
  readSessionCookies,
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
  REFRESH_MAX_AGE_SECONDS,
  SESSION_COOKIE,
  startSession,
} from "./session";

// The real package throws when imported outside a React Server Component
// build. Next resolves it to an empty module on the server; this does the same.
vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

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
  it("sets the session cookie, then the refresh cookie, with every option", async () => {
    await startSession(pair, "/");

    expect(cookieStore.set).toHaveBeenCalledTimes(2);
    expect(cookieStore.set).toHaveBeenNthCalledWith(1, "__Host-session", pair.accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 900,
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

  it("gives the session cookie the lifetime Nest sent", async () => {
    await startSession({ ...pair, expiresIn: 600 }, "/");

    expect(setOptions(0).maxAge).toBe(600);
    expect(setOptions(1).maxAge).toBe(SEVEN_DAYS_IN_SECONDS);
  });

  it("drops a fraction of a second from the lifetime", async () => {
    await startSession({ ...pair, expiresIn: 899.7 }, "/");

    expect(setOptions(0).maxAge).toBe(899);
  });

  // TokenPair is Nest's answer, so the type alone doesn't prove the value.
  // A bad lifetime falls back to Nest's documented 15 minutes, rather than
  // making a cookie that dies at once or never.
  it.each<[string, unknown]>([
    ["zero", 0],
    ["a negative number", -60],
    ["less than a second", 0.5],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["a string", "900"],
    ["null", null],
    ["undefined", undefined],
  ])("uses 900 seconds when expiresIn is %s", async (_label, expiresIn) => {
    await startSession({ ...pair, expiresIn } as unknown as TokenPair, "/");

    expect(setOptions(0).maxAge).toBe(900);
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

  it("never calls delete, which clears only the cookie at /", async () => {
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
