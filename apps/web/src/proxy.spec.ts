// @vitest-environment node
// proxy.ts runs on the Node runtime, so these tests do too.

import { readFileSync } from "node:fs";

import { getUnixNow } from "@northguild/gmt";
import { NextRequest } from "next/server";

import { safeNextPath } from "@/lib/next-path";
import { SESSION_COOKIE } from "@/lib/session";

import { config, proxy } from "./proxy";

// lib/session.ts is imported only for SESSION_COOKIE, so every test below
// proves proxy reads the cookie lib/session.ts writes. The real server-only
// package throws outside a React Server Component build; Next resolves it to
// an empty module on the server, and this does the same.
vi.mock("server-only", () => ({}));

// Only the clock is faked. Every other gmt export stays real.
vi.mock("@northguild/gmt", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@northguild/gmt")>()),
  getUnixNow: vi.fn(),
}));

// A made-up instant, in epoch seconds. Nothing here comes from a real token.
const NOW = 1_800_000_000;

const ORIGIN = "http://localhost:3001";

function base64url(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}

// A JWT-shaped string with the given payload. The header and signature are
// made up: proxy never checks the signature.
function tokenWith(payload: string): string {
  return `${base64url('{"alg":"HS256","typ":"JWT"}')}.${base64url(payload)}.signature_for-tests`;
}

// A token as Nest issues it: `iat` when it was issued, `exp` after
// `lifetime` seconds, with `secondsLeft` to go now.
function tokenWithLife(lifetime: number, secondsLeft: number): string {
  const exp = NOW + secondsLeft;
  return tokenWith(`{"sub":"7","sid":"s-1","iat":${exp - lifetime},"exp":${exp}}`);
}

// A token with Nest's usual 15-minute life.
function tokenExpiringIn(seconds: number): string {
  return tokenWithLife(900, seconds);
}

// A token with no `iat`. Nest's signer always writes one, so only a token
// Nest didn't issue looks like this.
function tokenWithoutIat(secondsLeft: number): string {
  return tokenWith(`{"sub":"7","sid":"s-1","exp":${NOW + secondsLeft}}`);
}

function requestFor(
  path: string,
  { method = "GET", cookie }: { method?: string; cookie?: string } = {},
): NextRequest {
  const headers = new Headers();
  if (cookie !== undefined) {
    headers.set("cookie", cookie);
  }
  return new NextRequest(`${ORIGIN}${path}`, { method, headers });
}

function sessionCookie(value: string): string {
  return `${SESSION_COOKIE}=${value}`;
}

// NextResponse.next() marks its response with this header.
function passedThrough(response: Response): boolean {
  return response.headers.get("x-middleware-next") === "1";
}

beforeEach(() => {
  vi.mocked(getUnixNow).mockReturnValue(NOW);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("the module", () => {
  const source = readFileSync(new URL("./proxy.ts", import.meta.url), "utf8");

  it("has no runtime export, because Next throws on one in proxy", () => {
    expect(source).not.toMatch(/export\s+const\s+runtime\b/);
  });

  it("does not import server-only or lib/session.ts", () => {
    expect(source).not.toMatch(/import\s+["']server-only["']/);
    expect(source).not.toMatch(/from\s+["']@\/lib\/session["']/);
  });

  it("uses no Date", () => {
    expect(source).not.toMatch(/\bDate\b/);
  });

  it("names the same session cookie as lib/session.ts", () => {
    expect(source).toContain(`const SESSION_COOKIE = "${SESSION_COOKIE}";`);
  });
});

describe("config", () => {
  // proxy.md warns that a matcher change silently drops coverage. Change this
  // only on purpose, together with proxy.ts.
  it("is pinned word for word, the prefetch rule included", () => {
    expect(config).toStrictEqual({
      matcher: [
        {
          source:
            "/((?!api(?:/|$)|_next/static/|_next/image(?:/|$)|favicon\\.ico$|.*\\.(?:avif|css|gif|ico|jpe?g|js|map|png|svg|ttf|otf|txt|webmanifest|webp|woff2?|xml)$).*)",
          missing: [{ type: "header", key: "next-router-prefetch" }],
        },
      ],
    });
  });
});

describe("the matcher, compiled by Next", () => {
  // Next's own compiler, the one `next build` runs on this config. It is
  // exported at runtime but missing from Next's type declarations, hence the
  // local type.
  type CompiledMatcher = { regexp: string; missing?: unknown };
  type GetMiddlewareMatchers = (
    matchers: typeof config.matcher,
    nextConfig: { i18n?: undefined; basePath?: string },
  ) => CompiledMatcher[];

  async function compiledMatcher(): Promise<CompiledMatcher> {
    const analysis = (await import("next/dist/build/analysis/get-page-static-info")) as unknown as {
      getMiddlewareMatchers: GetMiddlewareMatchers;
    };
    const [matcher] = analysis.getMiddlewareMatchers(config.matcher, {});
    if (!matcher) {
      throw new Error("Next compiled no matcher from config");
    }
    return matcher;
  }

  it.each(["/", "/feed", "/login", "/signup", "/feed/abc", "/apiary", "/u/john.doe", "/feed.rsc"])(
    "runs proxy for %s",
    async (pathname) => {
      const matcher = await compiledMatcher();
      expect(new RegExp(matcher.regexp).test(pathname)).toBe(true);
    },
  );

  it.each([
    "/api",
    "/api/x",
    "/api/auth/refresh",
    "/api/bff/users/me",
    "/_next/static/chunks/app.js",
    "/_next/image",
    "/favicon.ico",
    "/logo.png",
    "/fonts/atkinson.woff2",
    "/robots.txt",
    "/sitemap.xml",
  ])("skips %s", async (pathname) => {
    const matcher = await compiledMatcher();
    expect(new RegExp(matcher.regexp).test(pathname)).toBe(false);
  });

  it("keeps the prefetch rule on the compiled matcher", async () => {
    const matcher = await compiledMatcher();
    expect(matcher.missing).toStrictEqual([{ type: "header", key: "next-router-prefetch" }]);
  });
});

function expectPassedThrough(response: Response) {
  expect(passedThrough(response)).toBe(true);
  expect(response.headers.get("location")).toBeNull();
}

function expectRefresh(response: Response, location = `${ORIGIN}/api/auth/refresh?next=%2Ffeed`) {
  expect(passedThrough(response)).toBe(false);
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe(location);
}

/** The `next` that proxy put on the refresh URL, or null when it put none. */
function nextOf(response: Response): string | null {
  return new URL(response.headers.get("location") ?? "").searchParams.get("next");
}

describe("proxy", () => {
  it.each<[string, { method?: string; cookie?: string }, "pass" | "refresh"]>([
    ["no cookie", {}, "pass"],
    ["an empty session cookie", { cookie: sessionCookie("") }, "pass"],
    ["only some other cookie", { cookie: "theme=dark" }, "pass"],
    ["a token with 61 seconds left", { cookie: sessionCookie(tokenExpiringIn(61)) }, "pass"],
    ["a token with 60 seconds left", { cookie: sessionCookie(tokenExpiringIn(60)) }, "refresh"],
    ["a token with 59 seconds left", { cookie: sessionCookie(tokenExpiringIn(59)) }, "refresh"],
    ["a token at its exp", { cookie: sessionCookie(tokenExpiringIn(0)) }, "refresh"],
    ["an expired token", { cookie: sessionCookie(tokenExpiringIn(-1)) }, "refresh"],
    ["a malformed token", { cookie: sessionCookie("not-a-jwt") }, "refresh"],
    ["a token with no exp", { cookie: sessionCookie(tokenWith('{"sub":"7"}')) }, "refresh"],
    [
      "a POST with an expired token",
      { method: "POST", cookie: sessionCookie(tokenExpiringIn(-1)) },
      "pass",
    ],
    [
      "a HEAD with an expired token",
      { method: "HEAD", cookie: sessionCookie(tokenExpiringIn(-1)) },
      "pass",
    ],
    [
      "a PUT with an expired token",
      { method: "PUT", cookie: sessionCookie(tokenExpiringIn(-1)) },
      "pass",
    ],
  ])("GET /feed with %s: %s", (_name, options, expected) => {
    const response = proxy(requestFor("/feed", options));

    if (expected === "pass") {
      expectPassedThrough(response);
    } else {
      expectRefresh(response);
    }
  });

  // The window is 60 seconds, or half the token's own life when that is
  // shorter: min(60, floor((exp - iat) / 2)). So a token Nest has just issued
  // is never sent straight back to refresh, however short its life (QA-1,
  // AUTH-8 review round 1: a 60-second token used to loop until the browser
  // gave up with ERR_TOO_MANY_REDIRECTS).
  describe("the refresh window", () => {
    it.each<[string, "pass" | "refresh", number, number]>([
      // [what, expected, lifetime, seconds left]
      ["a 60-second token issued just now", "pass", 60, 60],
      ["a 60-second token issued a second ago, as the clock ticks over", "pass", 60, 59],
      ["a 60-second token with 31 seconds left", "pass", 60, 31],
      ["a 60-second token with 30 seconds left", "refresh", 60, 30],
      ["a 60-second token with 29 seconds left", "refresh", 60, 29],
      ["a 60-second token that has expired", "refresh", 60, -1],
      ["a 900-second token with 61 seconds left", "pass", 900, 61],
      ["a 900-second token with 60 seconds left", "refresh", 900, 60],
      ["a 120-second token issued just now", "pass", 120, 120],
      ["a 120-second token with 61 seconds left", "pass", 120, 61],
      ["a 120-second token with 60 seconds left", "refresh", 120, 60],
      ["a 10-second token issued just now", "pass", 10, 10],
      ["a 10-second token with 6 seconds left", "pass", 10, 6],
      ["a 10-second token with 5 seconds left", "refresh", 10, 5],
      ["a 3-second token issued a second ago", "pass", 3, 2],
      ["a 1-second token issued just now", "pass", 1, 1],
      ["a 1-second token at its exp", "refresh", 1, 0],
    ])("%s: %s", (_name, expected, lifetime, secondsLeft) => {
      const response = proxy(
        requestFor("/feed", { cookie: sessionCookie(tokenWithLife(lifetime, secondsLeft)) }),
      );

      if (expected === "pass") {
        expectPassedThrough(response);
      } else {
        expectRefresh(response);
      }
    });

    // Nest always writes `iat`, so this is only a token Nest didn't issue.
    // It gets the full 60 seconds, the rule from before the cap.
    it.each<[string, string, "pass" | "refresh"]>([
      ["no iat, 61 seconds left", tokenWithoutIat(61), "pass"],
      ["no iat, 60 seconds left", tokenWithoutIat(60), "refresh"],
      ["no iat, expired", tokenWithoutIat(-1), "refresh"],
      ["a string iat, 60 seconds left", tokenWith(`{"iat":"${NOW}","exp":${NOW + 60}}`), "refresh"],
      [
        "an iat after exp, 61 seconds left",
        tokenWith(`{"iat":${NOW + 100},"exp":${NOW + 61}}`),
        "pass",
      ],
      [
        "an iat after exp, 60 seconds left",
        tokenWith(`{"iat":${NOW + 100},"exp":${NOW + 60}}`),
        "refresh",
      ],
    ])("a token with %s: %s", (_name, token, expected) => {
      const response = proxy(requestFor("/feed", { cookie: sessionCookie(token) }));

      if (expected === "pass") {
        expectPassedThrough(response);
      } else {
        expectRefresh(response);
      }
    });
  });

  it("refreshes when gmt can't tell the time, rather than trust the token", () => {
    vi.mocked(getUnixNow).mockReturnValue(null);

    const response = proxy(requestFor("/feed", { cookie: sessionCookie(tokenExpiringIn(3600)) }));

    expect(response.status).toBe(307);
  });

  it("redirects with a 307 to /api/auth/refresh on the same origin, with next as the only query", () => {
    const response = proxy(requestFor("/feed", { cookie: sessionCookie(tokenExpiringIn(-1)) }));

    const location = new URL(response.headers.get("location") ?? "");
    expect(response.status).toBe(307);
    expect(location.origin).toBe(ORIGIN);
    expect(location.pathname).toBe("/api/auth/refresh");
    expect([...location.searchParams.keys()]).toEqual(["next"]);
  });

  it("puts the path and query in next, encoded", () => {
    const response = proxy(
      requestFor("/feed?tab=new&q=a b", { cookie: sessionCookie(tokenExpiringIn(-1)) }),
    );

    const location = response.headers.get("location") ?? "";
    expect(location).toBe(`${ORIGIN}/api/auth/refresh?next=%2Ffeed%3Ftab%3Dnew%26q%3Da%2520b`);
    expect(new URL(location).searchParams.get("next")).toBe("/feed?tab=new&q=a%20b");
  });

  it("sends the home page back to /", () => {
    const response = proxy(requestFor("/", { cookie: sessionCookie(tokenExpiringIn(-1)) }));

    expect(response.headers.get("location")).toBe(`${ORIGIN}/api/auth/refresh?next=%2F`);
  });

  // SEC-1 (AUTH-9 review round 1). The forgot and reset pages need no
  // session. A refresh that fails lands on /login?next=..., which would put
  // the reset token in /login's address bar and history, and send a member
  // who forgot their password to sign in.
  describe("the pages that need no session", () => {
    const expired = sessionCookie(tokenExpiringIn(-1));

    it.each([
      "/reset-password?token=made-up-reset-token-0123456789abcdefghijklmn",
      "/reset-password",
      "/forgot-password",
      "/forgot-password/sent",
    ])("lets GET %s through with an expired token", (path) => {
      expectPassedThrough(proxy(requestFor(path, { cookie: expired })));
    });

    it.each(["/reset-password-help", "/forgot-password/sent/more", "/reset-passwords"])(
      "still refreshes %s, which isn't one of them",
      (path) => {
        expect(passedThrough(proxy(requestFor(path, { cookie: expired })))).toBe(false);
      },
    );
  });

  it("refreshes before /login renders, so a second sign-in can end the old one", () => {
    const response = proxy(
      requestFor("/login?next=%2Ffeed", { cookie: sessionCookie(tokenExpiringIn(-1)) }),
    );

    expect(nextOf(response)).toBe("/login?next=%2Ffeed");
  });

  // The refresh handler runs `next` through safeNextPath and lands on /feed
  // when it refuses it. So proxy sends only a `next` that safeNextPath keeps
  // as it is (QA-3, AUTH-8 review round 1).
  describe("the next that proxy builds", () => {
    const expired = sessionCookie(tokenExpiringIn(-1));

    it.each(["/feed", "/feed?tab=new&q=a b", "/u/john.doe", "/login?next=%2Ffeed", "/"])(
      "sends %s in a form the refresh handler keeps",
      (path) => {
        const next = nextOf(proxy(requestFor(path, { cookie: expired })));

        expect(next).not.toBeNull();
        expect(safeNextPath(next, "/feed")).toBe(next);
      },
    );

    it("keeps the page but drops a query too long for safeNextPath", () => {
      const path = `/feed?q=${"a".repeat(2100)}`;

      const next = nextOf(proxy(requestFor(path, { cookie: expired })));

      expect(next).toBe("/feed");
      expect(safeNextPath(next, "/feed")).toBe("/feed");
    });

    it("keeps a query that just fits", () => {
      // "/feed?q=" is 8 characters, so this is 2048 in all.
      const path = `/feed?q=${"a".repeat(2040)}`;

      expect(nextOf(proxy(requestFor(path, { cookie: expired })))).toBe(path);
    });

    it.each([
      ["a path with //", "/feed//x?tab=new"],
      ["a path with a broken escape", "/feed%zz?tab=new"],
      ["a path too long for safeNextPath", `/${"a".repeat(2100)}`],
    ])("sends no next for %s, so the handler lands on /feed", (_what, path) => {
      const response = proxy(requestFor(path, { cookie: expired }));

      expectRefresh(response, `${ORIGIN}/api/auth/refresh`);
    });
  });
});
