import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Cookie,
  type Page,
  type Request,
  type Route,
} from "@playwright/test";

// Browser tests for AUTH-8: proxy.ts sends a navigation with a dying session
// through /api/auth/refresh, and the member comes straight back, signed in.
//
// They run against the real API at API_URL, like auth.spec.ts. Without it the
// whole file skips.
//
// To expire a session, a test overwrites __Host-session with a JWT-shaped value
// whose `exp` has passed, and keeps the real __Secure-refresh cookie. Proxy
// does not check signatures, and the refresh uses the real refresh token.
// The expired value is built from the real token's own `iat`, so no test needs
// a clock.
//
// Test data: made-up users. The username is `e2e-<12 hex>` and the email is
// `e2e-<12 hex>@example.com`, so the shared e2e cleanup removes them.

const SKIP_MESSAGE = "Start the API: pnpm db:up, then the API dev server";
const PASSWORD = "a-long-secret-123";
const SESSION_COOKIE = "__Host-session";
const REFRESH_COOKIE = "__Secure-refresh";
const REFRESH_PATH = "/api/auth/refresh";
const SEVEN_DAYS = 604800;

const API_URL = readApiUrl();

// Same reading as auth.spec.ts: Playwright does not load .env.local, but
// `next start` does. A variable set in the shell wins, as it does for Next.
function readApiUrl(): string {
  const fromShell = process.env.API_URL;
  if (fromShell) return fromShell.replace(/\/$/, "");
  try {
    const text = readFileSync(join(__dirname, "..", ".env.local"), "utf8");
    const line = text.split("\n").find((entry) => /^\s*API_URL\s*=/.test(entry));
    const value =
      line
        ?.split("=")
        .slice(1)
        .join("=")
        .trim()
        .replace(/^["']|["']$/g, "") ?? "";
    return value.replace(/\/$/, "");
  } catch {
    return "";
  }
}

async function apiIsUp(): Promise<boolean> {
  if (!API_URL) return false;
  try {
    const response = await fetch(API_URL, { signal: AbortSignal.timeout(3000) });
    return response.status > 0;
  } catch {
    return false;
  }
}

let apiUp = false;

test.beforeAll(async () => {
  apiUp = await apiIsUp();
});

test.beforeEach(() => {
  test.skip(!apiUp, SKIP_MESSAGE);
});

interface Dude {
  username: string;
  email: string;
  displayName: string;
  password: string;
}

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

function newDude(): Dude {
  const tag = randomBytes(6).toString("hex"); // 12 lower-case hex characters
  return {
    username: `e2e-${tag}`,
    email: `e2e-${tag}@example.com`,
    displayName: `e2e ${tag}`,
    password: PASSWORD,
  };
}

async function createDude(request: APIRequestContext): Promise<Dude> {
  const dude = newDude();
  const response = await request.post(`${API_URL}/auth/sign-up`, {
    data: {
      username: dude.username,
      email: dude.email,
      password: dude.password,
      profile: { displayName: dude.displayName },
    },
  });
  expect(response.status()).toBe(201);
  return dude;
}

function nestMe(request: APIRequestContext, accessToken: string) {
  return request.get(`${API_URL}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

function nestRefresh(request: APIRequestContext, refreshToken: string) {
  return request.post(`${API_URL}/auth/token/refresh`, { data: { refreshToken } });
}

function byName(cookies: Cookie[], name: string): Cookie | undefined {
  return cookies.find((cookie) => cookie.name === name);
}

async function sessionTokens(context: BrowserContext): Promise<Tokens> {
  const cookies = await context.cookies();
  const accessToken = byName(cookies, SESSION_COOKIE)?.value;
  const refreshToken = byName(cookies, REFRESH_COOKIE)?.value;
  expect(accessToken, "session cookie").toBeTruthy();
  expect(refreshToken, "refresh cookie").toBeTruthy();
  return { accessToken: accessToken as string, refreshToken: refreshToken as string };
}

function base64urlDecode(text: string): string {
  return Buffer.from(text, "base64url").toString("utf8");
}

function base64urlEncode(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}

// A JWT-shaped copy of the real token whose `exp` is its own `iat`, so it ran
// out the moment it was issued. The signature is junk: proxy never checks it,
// and the pages treat an expired token as no session.
function expiredCopyOf(accessToken: string): string {
  const [header, payload] = accessToken.split(".");
  const claims = JSON.parse(base64urlDecode(payload as string)) as { iat: number; exp: number };
  const dead = { ...claims, exp: claims.iat };
  return `${header}.${base64urlEncode(JSON.stringify(dead))}.expired-signature`;
}

function tokenExp(accessToken: string): number {
  const payload = accessToken.split(".")[1] as string;
  return (JSON.parse(base64urlDecode(payload)) as { exp: number }).exp;
}

// Overwrites the session cookie with an expired copy and keeps the refresh
// cookie. Returns the expired value so a test can tell it from a fresh one.
async function expireSession(context: BrowserContext, baseURL: string): Promise<string> {
  const { accessToken } = await sessionTokens(context);
  const dead = expiredCopyOf(accessToken);
  await context.addCookies([
    {
      name: SESSION_COOKIE,
      value: dead,
      domain: new URL(baseURL).hostname,
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const stored = byName(await context.cookies(), SESSION_COOKIE);
  expect(stored?.value).toBe(dead);
  return dead;
}

// Waits until React has attached to the form's button. The sign-in form is a
// client component, so once it is hydrated the page's Links are live too, and
// a click on one is a client-side navigation.
async function waitForHydration(page: Page, buttonName: string) {
  const button = page.getByRole("button", { name: buttonName, exact: true });
  await expect
    .poll(() =>
      button.evaluate((el) => Object.keys(el).some((key) => key.startsWith("__reactProps"))),
    )
    .toBe(true);
}

async function signInThroughPage(page: Page, dude: Dude) {
  await page.goto("/login");
  await waitForHydration(page, "Sign in");
  await page.getByLabel("Email").fill(dude.email);
  await page.getByLabel("Password", { exact: true }).fill(dude.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("You're signed in.")).toBeVisible();
}

// Every request the page makes to the refresh handler, in order.
function watchRefresh(page: Page): Request[] {
  const seen: Request[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === REFRESH_PATH) seen.push(request);
  });
  return seen;
}

function sessionCookie(cookies: Cookie[]): Cookie {
  const found = byName(cookies, SESSION_COOKIE);
  expect(found, "session cookie").toBeDefined();
  return found as Cookie;
}

// The session cookie is fresh: not the expired value, a token that is still
// live at Nest, and a seven-day cookie.
async function expectFreshSession(
  context: BrowserContext,
  request: APIRequestContext,
  dead: string,
) {
  const cookies = await context.cookies();
  const session = sessionCookie(cookies);
  expect(session.value).not.toBe(dead);
  expect(tokenExp(session.value)).toBeGreaterThan(tokenExp(dead));
  expect((await nestMe(request, session.value)).status()).toBe(200);
  expect(byName(cookies, REFRESH_COOKIE)).toBeDefined();
}

test.describe("a document navigation", () => {
  test("with a dead session refreshes once, then renders signed in", async ({
    page,
    context,
    request,
    baseURL,
  }) => {
    const dude = await createDude(request);
    await signInThroughPage(page, dude);
    const old = await sessionTokens(context);
    const dead = await expireSession(context, baseURL as string);
    const refreshes = watchRefresh(page);

    const response = await page.goto("/feed?from=e2e");

    await expect(page).toHaveURL("/feed?from=e2e");
    await expect(page.getByRole("heading", { level: 1, name: "Feed" })).toBeVisible();
    await expect(page.getByText(`Signed in as ${dude.displayName}.`)).toBeVisible();
    expect(response?.status()).toBe(200);

    // One refresh. It came back as a 303 that kept the page's own query.
    expect(refreshes).toHaveLength(1);
    expect(new URL(refreshes[0]?.url() as string).searchParams.get("next")).toBe("/feed?from=e2e");
    const refreshResponse = await refreshes[0]?.response();
    // The document load is 307 (proxy), 303 (handler), 200: the last redirect
    // in the chain is the handler's 303.
    expect(refreshResponse?.status()).toBe(303);

    await expectFreshSession(context, request, dead);
    // The refresh token was rotated, and the session cookie is a seven-day one.
    const after = await context.cookies();
    expect(byName(after, REFRESH_COOKIE)?.value).not.toBe(old.refreshToken);
    const lifetime =
      (sessionCookie(after).expires ?? 0) - (byName(after, REFRESH_COOKIE)?.expires ?? 0);
    expect(Math.abs(lifetime)).toBeLessThanOrEqual(1);
    expect(sessionCookie(after).expires).toBeGreaterThan(tokenExp(sessionCookie(after).value));
    expect(sessionCookie(after).expires - tokenExp(sessionCookie(after).value)).toBeGreaterThan(
      SEVEN_DAYS - 1000,
    );
  });
});

test.describe("a client-side navigation", () => {
  // No page links to /feed, so this uses the real Link from /login to /signup.
  // Proxy covers both.
  test("a <Link> click with a dead session refreshes, then lands signed in", async ({
    page,
    context,
    request,
    baseURL,
  }) => {
    const dude = await createDude(request);
    await signInThroughPage(page, dude);
    // A prefetched page is shown from the router's cache when the Link is
    // clicked, and that never reaches proxy. Turn the prefetches away, so the
    // click has to ask the server for the page.
    await page.route(/\/signup\?_rsc=/, (route) =>
      route.request().headers()["next-router-prefetch"] ? route.abort() : route.continue(),
    );
    await page.goto("/login");
    await waitForHydration(page, "Sign in");
    const dead = await expireSession(context, baseURL as string);
    const refreshes = watchRefresh(page);
    const documents: string[] = [];
    page.on("request", (r) => {
      if (r.isNavigationRequest()) documents.push(r.url());
    });

    await page.getByRole("link", { name: "Sign up" }).click();

    await expect(page).toHaveURL("/signup");
    await expect(page.getByRole("button", { name: "Sign up", exact: true })).toBeVisible();

    // One refresh, and no document load: the router followed the redirects.
    // The handler is asked twice by URL: proxy's 307 points at it, and Next
    // adds its own `_rsc` query and asks again. Only the second one reaches
    // the handler, which answers 303.
    expect(documents).toEqual([]);
    const statuses = await Promise.all(refreshes.map(async (r) => (await r.response())?.status()));
    expect(statuses.filter((status) => status === 303)).toHaveLength(1);
    expect(refreshes.every((r) => new URL(r.url()).searchParams.get("next") === "/signup")).toBe(
      true,
    );
    await expectFreshSession(context, request, dead);
  });

  test("a prefetch with a dead session makes no request to the refresh handler", async ({
    page,
    context,
    request,
    baseURL,
  }) => {
    const dude = await createDude(request);
    await signInThroughPage(page, dude);
    await page.goto("/login");
    await waitForHydration(page, "Sign in");
    // Hold every prefetch of /signup until the session is dead, so the
    // prefetch is sure to be sent with the dead cookie.
    const held: Route[] = [];
    await page.route(/\/signup\?_rsc=/, (route) => {
      if (route.request().headers()["next-router-prefetch"]) held.push(route);
      else void route.continue();
    });
    await page.goto("/login");
    await waitForHydration(page, "Sign in");
    await expect.poll(() => held.length).toBeGreaterThan(0);
    const dead = await expireSession(context, baseURL as string);
    const refreshes = watchRefresh(page);
    const answered = page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/signup" && r.url().includes("_rsc="),
    );
    await page.getByRole("link", { name: "Sign up" }).hover();
    for (const route of held) await route.continue();
    const answer = await answered;

    // The prefetch never reached proxy: it was answered, not redirected, and
    // the dead cookie is still there.
    expect(answer.status()).toBe(200);
    expect(answer.request().redirectedFrom()).toBeNull();
    expect(refreshes).toEqual([]);
    expect(sessionCookie(await context.cookies()).value).toBe(dead);
  });
});

// The real path behind a Link: the router prefetches a page that reads the
// session, the session dies, then the member navigates. No page links to / or
// /feed, so the test drives the router the way a Link does.
interface NextRouter {
  prefetch(href: string): void;
  push(href: string): void;
}

test.describe("a prefetched session page", () => {
  const pages = [
    { path: "/", text: () => "You're signed in." },
    { path: "/feed", text: (dude: Dude) => `Signed in as ${dude.displayName}.` },
  ];
  for (const { path, text } of pages) {
    test(`${path} prefetched, then the session dies, then a push refreshes once`, async ({
      page,
      context,
      request,
      baseURL,
    }) => {
      const dude = await createDude(request);
      await signInThroughPage(page, dude);
      // Wait on the prefetch response, not a timeout. Register the wait before
      // the page loads: the site header's <Link href="/"> prefetches "/" on its
      // own, and the router then has nothing new to fetch when asked. For
      // /feed no link exists, so the router.prefetch call below sends it.
      function isPrefetch(r: { url(): string; request(): Request }): boolean {
        return (
          new URL(r.url()).pathname === path &&
          r.url().includes("_rsc=") &&
          r.request().headers()["next-router-prefetch"] !== undefined
        );
      }
      const prefetched = page.waitForResponse(isPrefetch);
      await page.goto("/login");
      await waitForHydration(page, "Sign in");
      await page.evaluate(
        (href) =>
          (window as unknown as { next: { router: NextRouter } }).next.router.prefetch(href),
        path,
      );
      expect((await prefetched).status()).toBe(200);

      const dead = await expireSession(context, baseURL as string);
      const refreshes = watchRefresh(page);
      const documents: string[] = [];
      page.on("request", (r) => {
        if (r.isNavigationRequest()) documents.push(r.url());
      });

      await page.evaluate(
        (href) => (window as unknown as { next: { router: NextRouter } }).next.router.push(href),
        path,
      );

      await expect(page).toHaveURL(path);
      await expect(page.getByText(text(dude))).toBeVisible();
      expect(documents).toEqual([]);
      const statuses = await Promise.all(
        refreshes.map(async (r) => (await r.response())?.status()),
      );
      expect(statuses.filter((status) => status === 303)).toHaveLength(1);
      await expectFreshSession(context, request, dead);
    });
  }
});

test.describe("an anonymous visitor", () => {
  for (const path of ["/", "/login", "/feed"]) {
    test(`${path} gets no redirect through the refresh handler`, async ({ page, context }) => {
      const refreshes = watchRefresh(page);

      await page.goto(path);

      if (path === "/feed") {
        // The page itself sends a visitor with no session to sign in.
        await expect(page).toHaveURL(/\/login\?next=%2Ffeed$/);
      } else {
        await expect(page).toHaveURL(path);
      }
      expect(refreshes).toEqual([]);
      expect(await context.cookies()).toEqual([]);
    });
  }
});

test.describe("a refresh that fails", () => {
  test("a replayed old refresh token clears both cookies and lands on /login?next=", async ({
    page,
    context,
    request,
    baseURL,
  }) => {
    const dude = await createDude(request);
    await signInThroughPage(page, dude);
    const old = await sessionTokens(context);

    // Spend the refresh token at Nest from the runner. The browser still holds
    // it, so its refresh is a replay, and Nest ends the whole sign-in.
    expect((await nestRefresh(request, old.refreshToken)).status()).toBe(200);
    await expireSession(context, baseURL as string);
    const refreshes = watchRefresh(page);

    await page.goto("/feed");

    await expect(page).toHaveURL(/\/login\?next=%2Ffeed$/);
    expect(refreshes).toHaveLength(1);
    const cookies = await context.cookies();
    expect(byName(cookies, SESSION_COOKIE)).toBeUndefined();
    expect(byName(cookies, REFRESH_COOKIE)).toBeUndefined();
    // Nest ended the sign-in: the replayed token and the first access token are dead.
    expect((await nestRefresh(request, old.refreshToken)).status()).toBe(401);
    expect((await nestMe(request, old.accessToken)).status()).toBe(401);
  });

  test("the handler on its own, with no refresh cookie, clears the session cookie and goes to /login?next=", async ({
    page,
    context,
    request,
  }) => {
    const dude = await createDude(request);
    await signInThroughPage(page, dude);
    await context.clearCookies({ name: REFRESH_COOKIE });

    await page.goto(`${REFRESH_PATH}?next=%2Ffeed`);

    await expect(page).toHaveURL(/\/login\?next=%2Ffeed$/);
    expect(byName(await context.cookies(), SESSION_COOKIE)).toBeUndefined();
  });
});

test.describe("where the refresh handler sends the member", () => {
  const cases = [
    { name: "next=https://evil.example.com", query: "?next=https%3A%2F%2Fevil.example.com" },
    { name: "no next", query: "" },
  ];
  for (const { name, query } of cases) {
    test(`${name} lands on /feed`, async ({ page, context, request, baseURL }) => {
      const dude = await createDude(request);
      await signInThroughPage(page, dude);
      const before = await sessionTokens(context);

      await page.goto(`${REFRESH_PATH}${query}`);

      await expect(page).toHaveURL("/feed");
      expect(new URL(page.url()).origin).toBe(baseURL);
      await expect(page.getByText(`Signed in as ${dude.displayName}.`)).toBeVisible();
      const after = await sessionTokens(context);
      expect(after.refreshToken).not.toBe(before.refreshToken);
    });
  }
});

test.describe("the browser proxy to Nest", () => {
  test("GET /api/bff/users/1 is outside the allow-list and gets 404", async ({ page, request }) => {
    const dude = await createDude(request);
    await signInThroughPage(page, dude);

    const response = await page.request.get("/api/bff/users/1");

    expect(response.status()).toBe(404);
  });
});

test.describe("two pages that refresh together", () => {
  test("both stay signed in, and Nest keeps the sign-in alive", async ({
    page,
    context,
    request,
    baseURL,
  }) => {
    const dude = await createDude(request);
    await signInThroughPage(page, dude);
    const dead = await expireSession(context, baseURL as string);
    const other = await context.newPage();

    // Both start from the same cookies, so both carry the same refresh token.
    await Promise.all([page.goto("/feed"), other.goto("/feed")]);

    for (const tab of [page, other]) {
      await expect(tab).toHaveURL("/feed");
      await expect(tab.getByText(`Signed in as ${dude.displayName}.`)).toBeVisible();
    }
    await expectFreshSession(context, request, dead);
  });
});

test.describe("a second sign-in after the session expired", () => {
  test("ends the old sign-in at Nest", async ({ page, context, request, baseURL }) => {
    const dude = await createDude(request);
    await signInThroughPage(page, dude);
    const first = await sessionTokens(context);
    const dead = await expireSession(context, baseURL as string);

    // Proxy refreshes before /login renders, so the form's action has a live
    // token to end the old sign-in with.
    await page.goto("/login");
    await waitForHydration(page, "Sign in");
    const refreshed = await sessionTokens(context);
    expect(refreshed.accessToken).not.toBe(dead);
    expect((await nestMe(request, refreshed.accessToken)).status()).toBe(200);

    await page.getByLabel("Email").fill(dude.email);
    await page.getByLabel("Password", { exact: true }).fill(dude.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText("You're signed in.")).toBeVisible();
    const second = await sessionTokens(context);
    expect(second.refreshToken).not.toBe(refreshed.refreshToken);

    // The old sign-in is over at Nest, from the runner.
    expect((await nestMe(request, refreshed.accessToken)).status()).toBe(401);
    expect((await nestRefresh(request, refreshed.refreshToken)).status()).toBe(401);
    expect((await nestRefresh(request, first.refreshToken)).status()).toBe(401);
    // The new sign-in is alive.
    expect((await nestMe(request, second.accessToken)).status()).toBe(200);
  });
});
