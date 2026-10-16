import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Cookie,
  type Locator,
  type Page,
} from "@playwright/test";

// Browser tests for AUTH-7: sign up, sign in and sign out through the BFF.
//
// They run against the real API at API_URL, which the user starts with
// `pnpm db:up` and the API dev server. Without it the whole file skips.
//
// Rate limit. POST /auth/token allows 5 tries in 15 minutes, counted per
// account and address together (AuthThrottlerGuard builds the tracker from
// `<identifier>|<ip>`). Every test makes its own user, so the count of one
// test never touches another. The 429 test uses up only its own user's
// tries. No guard is turned off.
//
// Test data: made-up users. The username is `e2e-<12 hex>` and the email is
// `e2e-<12 hex>@example.com`, so the shared e2e cleanup in
// apps/api/test/e2e-cleanup.ts removes them. It runs before and after this
// web run, through Playwright's globalSetup and globalTeardown (e2e/global-setup.ts
// and e2e/global-teardown.ts), as well as before and after each API e2e run.

const SKIP_MESSAGE = "Start the API: pnpm db:up, then the API dev server";
const PASSWORD = "a-long-secret-123";
const SESSION_COOKIE = "__Host-session";
const REFRESH_COOKIE = "__Secure-refresh";
const NEXT_BUG = "https://github.com/vercel/next.js/issues/99756";

const API_URL = readApiUrl();

// Playwright does not load .env.local, but `next start` does. Read the same
// value so the runner can reach Nest directly (for the checks the browser must
// never make). A variable set in the shell wins, as it does for Next.
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

function newDude(): Dude {
  const tag = randomBytes(6).toString("hex"); // 12 lower-case hex characters
  return {
    username: `e2e-${tag}`,
    email: `e2e-${tag}@example.com`,
    displayName: `e2e ${tag}`,
    password: PASSWORD,
  };
}

// Makes the user in Nest directly, from the runner. The browser tests then
// sign in through the page.
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

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

async function nestTokens(request: APIRequestContext, dude: Dude): Promise<Tokens> {
  const response = await request.post(`${API_URL}/auth/token`, {
    data: { identifier: dude.email, password: dude.password },
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as Tokens;
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

// Waits until React has attached to the form's button, so a click runs the
// client handler and the action state shows. Same signal as shell.spec.ts.
async function waitForHydration(page: Page, buttonName: string) {
  const button = page.getByRole("button", { name: buttonName, exact: true });
  await expect
    .poll(() =>
      button.evaluate((el) => Object.keys(el).some((key) => key.startsWith("__reactProps"))),
    )
    .toBe(true);
}

async function fillSignIn(page: Page, dude: Dude, password = dude.password) {
  await page.getByLabel("Email").fill(dude.email);
  await page.getByLabel("Password", { exact: true }).fill(password);
}

async function fillSignUp(page: Page, dude: Dude) {
  await page.getByLabel("Email").fill(dude.email);
  await page.getByLabel("Display name").fill(dude.displayName);
  await page.getByLabel("Username").fill(dude.username);
  await page.getByLabel("Password", { exact: true }).fill(dude.password);
}

async function signInThroughPage(page: Page, dude: Dude) {
  await page.goto("/login");
  await waitForHydration(page, "Sign in");
  await fillSignIn(page, dude);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("You're signed in.")).toBeVisible();
}

// Collects every request the page makes to the API's origin. The browser must
// make none: only Next's server talks to Nest.
function watchApiOrigin(page: Page): string[] {
  const apiOrigin = new URL(API_URL).origin;
  const seen: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).origin === apiOrigin) seen.push(request.url());
  });
  return seen;
}

async function newSignedOutContext(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

// Presses Tab until the target has focus, so a test uses the keyboard only.
// It stops with a clear failure if the target is not on the tab path.
async function tabTo(page: Page, target: Locator, limit = 40) {
  for (let step = 0; step < limit; step += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((el) => el === document.activeElement)) return;
  }
  await expect(target, `not reached by Tab in ${limit} presses`).toBeFocused();
}

// Types into the field that has focus, then moves on with Tab.
async function typeAndTab(page: Page, field: Locator, text: string) {
  await tabTo(page, field);
  await page.keyboard.type(text);
}

// The text of every element an input's aria-describedby names.
function describedText(input: Locator): Promise<string[]> {
  return input.evaluate((el) =>
    (el.getAttribute("aria-describedby") ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? ""),
  );
}

// Waits for the POST to answer, whatever its status, and returns the status.
function postStatus(page: Page, path: string) {
  return page.waitForResponse(
    (r) => r.request().method() === "POST" && new URL(r.url()).pathname === path,
  );
}

const THEMES = ["light", "dark"] as const;
const MOTIONS = ["no-preference", "reduce"] as const;
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.describe("sign up", () => {
  test("makes the user in Nest and sets two httpOnly cookies that page scripts cannot see", async ({
    page,
    context,
    request,
  }) => {
    const apiCalls = watchApiOrigin(page);
    const dude = newDude();

    await page.goto("/signup");
    await waitForHydration(page, "Sign up");
    await fillSignUp(page, dude);
    await page.getByRole("button", { name: "Sign up", exact: true }).click();
    await expect(page.getByText("You're signed in.")).toBeVisible();
    await expect(page).toHaveURL("/");

    // Nest made the user and the profile.
    const tokens = await nestTokens(request, dude);
    const me = await nestMe(request, tokens.accessToken);
    expect(me.status()).toBe(200);
    expect(await me.json()).toMatchObject({
      username: dude.username,
      email: dude.email,
      profile: { displayName: dude.displayName },
    });

    // The cookies, attribute by attribute.
    const cookies = await context.cookies();
    const session = byName(cookies, SESSION_COOKIE);
    const refresh = byName(cookies, REFRESH_COOKIE);
    expect(session).toMatchObject({
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    });
    expect(refresh).toMatchObject({
      path: "/api/auth",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    });
    // Both cookies are set in one response and both last seven days (the
    // session cookie lives as long as the refresh cookie, so proxy can see a
    // dying token), so their expiry times match.
    const gap = (refresh?.expires ?? 0) - (session?.expires ?? 0);
    expect(Math.abs(gap)).toBeLessThanOrEqual(1);
    expect(session?.expires ?? 0).toBeGreaterThan(0);

    // Page scripts see neither cookie.
    const visible = await page.evaluate(() => document.cookie);
    expect(visible).not.toContain(SESSION_COOKIE);
    expect(visible).not.toContain(REFRESH_COOKIE);

    // No token reaches the page in any form.
    const html = await page.content();
    expect(html).not.toContain(session?.value as string);
    expect(html).not.toContain(refresh?.value as string);

    expect(apiCalls).toEqual([]);
  });

  test("a taken display name, in another letter case, shows the 409 message under the display name", async ({
    page,
    request,
  }) => {
    const taken = await createDude(request);
    const dude = newDude();
    // Hex digits are lower case, so upper-casing makes the same name in a new case.
    dude.displayName = taken.displayName.toUpperCase();

    await page.goto("/signup");
    await waitForHydration(page, "Sign up");
    await fillSignUp(page, dude);
    await page.getByRole("button", { name: "Sign up", exact: true }).click();

    const field = page.getByLabel("Display name");
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(
      page.getByText("Another member already goes by that name. Try another."),
    ).toBeVisible();
    // The typed values stay, and the password does not.
    await expect(field).toHaveValue(dude.displayName);
    await expect(page.getByLabel("Email")).toHaveValue(dude.email);
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
    await expect(page).toHaveURL(/\/signup$/);
  });

  test("a username with @ shows Nest's 400 message under the username", async ({
    page,
    context,
  }) => {
    const dude = newDude();
    dude.username = `e2e@${dude.username.slice(4)}`;

    await page.goto("/signup");
    await waitForHydration(page, "Sign up");
    await fillSignUp(page, dude);
    // The browser's own pattern would stop this post. Switch its checks off
    // for this one form, so the request reaches Nest and Nest's answer shows.
    await page.locator("form").evaluate((form) => {
      (form as HTMLFormElement).noValidate = true;
    });
    await page.getByRole("button", { name: "Sign up", exact: true }).click();

    await expect(page.getByLabel("Username")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("username must not contain spaces or @")).toBeVisible();
    expect(byName(await context.cookies(), SESSION_COOKIE)).toBeUndefined();
  });
});

test.describe("sign in", () => {
  test("a wrong password shows one message, and a signed-in cookie is never set", async ({
    page,
    context,
    request,
  }) => {
    const apiCalls = watchApiOrigin(page);
    const dude = await createDude(request);

    await page.goto("/login");
    await waitForHydration(page, "Sign in");
    await fillSignIn(page, dude, "not-the-right-password-1");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page.locator("form").getByRole("alert")).toHaveText(
      "That email or password doesn't match.",
    );
    // The email stays and the password is cleared.
    await expect(page.getByLabel("Email")).toHaveValue(dude.email);
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
    expect(byName(await context.cookies(), SESSION_COOKIE)).toBeUndefined();
    expect(apiCalls).toEqual([]);
  });

  test("the sixth try in 15 minutes shows 'Easy, man' with the minutes from Retry-After", async ({
    page,
    request,
  }) => {
    const dude = await createDude(request);

    // Five wrong tries from the runner use up this user's count. The count is
    // for this email and address together, so no other test is touched.
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await request.post(`${API_URL}/auth/token`, {
        data: { identifier: dude.email, password: "not-the-right-password-1" },
      });
      expect(response.status(), `try ${attempt}`).toBe(401);
    }

    await page.goto("/login");
    await waitForHydration(page, "Sign in");
    await fillSignIn(page, dude, "not-the-right-password-1");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    const alert = page.locator("form").getByRole("alert");
    await expect(alert).toContainText("Easy, man. Try again in");

    // Ask Nest for the wait. It is still counting down, but ceil(seconds / 60)
    // does not change within the few seconds between the two calls.
    const refused = await request.post(`${API_URL}/auth/token`, {
      data: { identifier: dude.email, password: "not-the-right-password-1" },
    });
    expect(refused.status()).toBe(429);
    const seconds = Number(refused.headers()["retry-after"]);
    expect(seconds).toBeGreaterThan(0);
    const minutes = Math.ceil(seconds / 60);
    await expect(alert).toHaveText(
      `Easy, man. Try again in ${minutes === 1 ? "1 minute" : `${minutes} minutes`}.`,
    );
  });

  test("next=/?welcome=1 lands on /?welcome=1, and next=//evil.example.com lands on /", async ({
    page,
    browser,
    request,
  }) => {
    const good = await createDude(request);
    await page.goto("/login?next=%2F%3Fwelcome%3D1");
    await waitForHydration(page, "Sign in");
    await expect(page.locator('input[name="next"]')).toHaveValue("/?welcome=1");
    await fillSignIn(page, good);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL("/?welcome=1");
    await expect(page.getByText("You're signed in.")).toBeVisible();

    const evil = await createDude(request);
    const second = await newSignedOutContext(browser);
    const evilPage = second.page;
    await evilPage.goto("/login?next=%2F%2Fevil.example.com");
    await waitForHydration(evilPage, "Sign in");
    await fillSignIn(evilPage, evil);
    await evilPage.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(evilPage.getByText("You're signed in.")).toBeVisible();
    expect(new URL(evilPage.url()).origin).toBe(new URL(page.url()).origin);
    expect(new URL(evilPage.url()).pathname).toBe("/");
    expect(new URL(evilPage.url()).search).toBe("");
    await second.context.close();
  });
});

test.describe("sign out", () => {
  test("revokes the refresh token in Nest, clears both cookies, and stops the old access token", async ({
    page,
    context,
    request,
  }) => {
    const apiCalls = watchApiOrigin(page);
    const dude = await createDude(request);
    await signInThroughPage(page, dude);
    const old = await sessionTokens(context);
    expect((await nestMe(request, old.accessToken)).status()).toBe(200);

    await page.getByRole("button", { name: "Sign out", exact: true }).click();

    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign up" })).toBeVisible();
    await expect(page.getByText("You're signed in.")).toBeHidden();
    const after = await context.cookies();
    expect(byName(after, SESSION_COOKIE)).toBeUndefined();
    expect(byName(after, REFRESH_COOKIE)).toBeUndefined();

    // Checked at Nest, from the runner: the old tokens are dead.
    expect((await nestMe(request, old.accessToken)).status()).toBe(401);
    expect((await nestRefresh(request, old.refreshToken)).status()).toBe(401);
    expect(apiCalls).toEqual([]);
  });

  // QA-2. /login still shows its form to a signed-in member, so signing in
  // again in the same browser is a normal path. The second sign-in replaces
  // both cookies, so Sign out sees only the second one. The sign-in action
  // ends the first one at Nest before it sets the new cookies.
  test("sign out after signing in a second time leaves the first sign-in dead at Nest too", async ({
    page,
    context,
    request,
  }) => {
    const dude = await createDude(request);
    await signInThroughPage(page, dude);
    const first = await sessionTokens(context);
    expect((await nestMe(request, first.accessToken)).status()).toBe(200);

    // Well inside the 15 minutes the first access token lasts.
    await signInThroughPage(page, dude);
    const second = await sessionTokens(context);
    expect(second.accessToken).not.toBe(first.accessToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);

    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();

    // Checked at Nest, from the runner: both sign-ins are over.
    expect((await nestMe(request, first.accessToken)).status()).toBe(401);
    expect((await nestRefresh(request, first.refreshToken)).status()).toBe(401);
    expect((await nestMe(request, second.accessToken)).status()).toBe(401);
    expect((await nestRefresh(request, second.refreshToken)).status()).toBe(401);
  });

  test("sign out everywhere ends the other context's sign-in too", async ({
    page,
    context,
    browser,
    request,
  }) => {
    const dude = await createDude(request);
    await signInThroughPage(page, dude);
    const first = await sessionTokens(context);

    const other = await newSignedOutContext(browser);
    try {
      await signInThroughPage(other.page, dude);
      const second = await sessionTokens(other.context);
      expect((await nestMe(request, second.accessToken)).status()).toBe(200);
      expect((await nestMe(request, first.accessToken)).status()).toBe(200);

      await page.getByRole("button", { name: "Sign out everywhere" }).click();

      await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
      const after = await context.cookies();
      expect(byName(after, SESSION_COOKIE)).toBeUndefined();
      expect(byName(after, REFRESH_COOKIE)).toBeUndefined();

      // The second context still holds its cookies, but Nest refuses both.
      expect((await nestMe(request, second.accessToken)).status()).toBe(401);
      expect((await nestRefresh(request, second.refreshToken)).status()).toBe(401);
      expect((await nestMe(request, first.accessToken)).status()).toBe(401);
      expect((await nestRefresh(request, first.refreshToken)).status()).toBe(401);
    } finally {
      await other.context.close();
    }
  });
});

test.describe("a cross-origin POST to a logout handler", () => {
  for (const path of ["/api/auth/logout", "/api/auth/logout-everywhere"]) {
    test(`${path} answers 403 and changes no cookie`, async ({
      page,
      context,
      request,
      baseURL,
    }) => {
      const dude = await createDude(request);
      await signInThroughPage(page, dude);
      const before = await sessionTokens(context);

      // A form on another site posts to the logout handler. The browser sends
      // Origin: http://evil.example.com.
      const evil = await context.newPage();
      await evil.route("http://evil.example.com/**", (route) =>
        route.fulfill({
          contentType: "text/html",
          body: `<form method="post" action="${baseURL}${path}"><button>Go</button></form>`,
        }),
      );
      await evil.goto("http://evil.example.com/");
      const [response] = await Promise.all([
        evil.waitForResponse((r) => r.url().endsWith(path)),
        evil.getByRole("button", { name: "Go" }).click(),
      ]);
      expect(response.status()).toBe(403);
      expect((await response.allHeaders())["set-cookie"]).toBeUndefined();

      // A direct POST with no Origin at all gets the same answer.
      const bare = await request.post(`${baseURL}${path}`);
      expect(bare.status()).toBe(403);

      // Nothing changed: the same cookies, and Nest still accepts the token.
      expect(await sessionTokens(context)).toEqual(before);
      expect((await nestMe(request, before.accessToken)).status()).toBe(200);
    });
  }
});

test.describe("with JavaScript off", () => {
  test.use({ javaScriptEnabled: false });

  test("sign in posts, follows the 303 to /, and sets both cookies", async ({
    page,
    context,
    request,
  }) => {
    const dude = await createDude(request);
    await page.goto("/login");
    await fillSignIn(page, dude);
    const [post] = await Promise.all([
      postStatus(page, "/login"),
      page.getByRole("button", { name: "Sign in", exact: true }).click(),
    ]);
    // The action answers with a redirect, not a page (lesson point 5).
    expect(post.status()).toBe(303);

    await expect(page).toHaveURL("/");
    const cookies = await context.cookies();
    expect(byName(cookies, SESSION_COOKIE)).toMatchObject({ httpOnly: true, secure: true });
    expect(byName(cookies, REFRESH_COOKIE)).toMatchObject({ path: "/api/auth" });
  });

  test("sign up posts, follows the 303 to /, and the user exists in Nest", async ({
    page,
    context,
    request,
  }) => {
    const dude = newDude();
    await page.goto("/signup");
    await fillSignUp(page, dude);
    const [post] = await Promise.all([
      postStatus(page, "/signup"),
      page.getByRole("button", { name: "Sign up", exact: true }).click(),
    ]);
    expect(post.status()).toBe(303);

    await expect(page).toHaveURL("/");
    expect(byName(await context.cookies(), SESSION_COOKIE)).toBeDefined();
    expect(
      (
        await request.post(`${API_URL}/auth/token`, {
          data: { identifier: dude.email, password: dude.password },
        })
      ).status(),
    ).toBe(200);
  });

  test("the show-password button is hidden and out of the tab path, and sign in still works", async ({
    page,
    context,
    request,
  }) => {
    const dude = await createDude(request);
    await page.goto("/login");

    // It is in the HTML, but not visible and not usable.
    // Playwright's role locators skip hidden and inert elements, so find it by
    // its markup.
    const eye = page.locator('form button[type="button"][aria-pressed]');
    await expect(eye).toHaveCount(1);
    await expect(eye).toBeHidden();
    await expect(eye).toHaveJSProperty("inert", true);
    await expect(page.getByRole("button", { name: "Show password" })).toHaveCount(0);

    // Tab goes from the password to "Forgot password?", then to the submit
    // button. The show-password button is not a stop in between.
    await page.getByLabel("Email").fill(dude.email);
    const password = page.getByLabel("Password", { exact: true });
    await password.fill(dude.password);
    await expect(password).toHaveAttribute("type", "password");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Forgot password?" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeFocused();

    await page.keyboard.press("Enter");
    // The session corner needs JavaScript, so check the cookie instead.
    await expect(page).toHaveURL("/");
    expect(byName(await context.cookies(), SESSION_COOKIE)).toBeDefined();
  });

  test("the browser's own rules stop a short password, so nothing posts", async ({ page }) => {
    const posts: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST") posts.push(request.url());
    });
    const dude = newDude();
    await page.goto("/signup");
    await fillSignUp(page, { ...dude, password: "short" });
    await page.getByRole("button", { name: "Sign up", exact: true }).click();

    // The browser puts focus on the first input it refuses.
    const password = page.getByLabel("Password", { exact: true });
    await expect(password).toBeFocused();
    expect(await password.evaluate((el) => (el as HTMLInputElement).validity.tooShort)).toBe(true);
    expect(posts).toEqual([]);
    await expect(page).toHaveURL(/\/signup$/);
  });

  test("the browser's own rules stop an email that is not an email, so nothing posts", async ({
    page,
  }) => {
    const posts: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST") posts.push(request.url());
    });
    await page.goto("/login");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password", { exact: true }).fill("whatever-it-is");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page.getByLabel("Email")).toBeFocused();
    expect(posts).toEqual([]);
  });

  // KNOWN NEXT BUG. This test pins today's behaviour so that a fix shows up.
  // With cacheComponents on, a JavaScript-off POST that does not redirect gets
  // back flight data and no HTML shell, so the browser shows a blank page.
  // It FAILS once Next fixes the bug. Then replace it with a real test that a
  // wrong password shows "That email or password doesn't match." with the typed
  // email kept.
  test("KNOWN BUG: a wrong password answers with no HTML shell (vercel/next.js#99756)", async ({
    page,
    request,
  }) => {
    test.info().annotations.push({ type: "issue", description: NEXT_BUG });
    const dude = await createDude(request);
    await page.goto("/login");
    await fillSignIn(page, dude, "not-the-right-password-1");

    const [response] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/login")),
      page.getByRole("button", { name: "Sign in", exact: true }).click(),
    ]);
    const body = await response.text();
    // Fails when Next answers with a real document.
    expect(body, `Next may have fixed ${NEXT_BUG}`).not.toContain("<html");
  });
});

test.describe("after a 400, with JavaScript on", () => {
  test("focus is on the first invalid field, its error is read through aria-describedby, and typing clears both", async ({
    page,
  }) => {
    const dude = newDude();
    dude.username = `e2e@${dude.username.slice(4)}`;

    await page.goto("/signup");
    await waitForHydration(page, "Sign up");
    await fillSignUp(page, dude);
    // Switch the browser's own checks off for this form, so Nest answers 400.
    await page.locator("form").evaluate((form) => {
      (form as HTMLFormElement).noValidate = true;
    });
    await page.getByRole("button", { name: "Sign up", exact: true }).click();

    const username = page.getByLabel("Username");
    await expect(username).toHaveAttribute("aria-invalid", "true");
    await expect(username).toBeFocused();

    const message = "username must not contain spaces or @";
    expect(await describedText(username)).toContain(message);
    await expect(page.getByLabel("Email")).not.toHaveAttribute("aria-invalid", "true");

    // Typing in the field clears the flag and the message.
    await page.keyboard.type("x");
    await expect(username).not.toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText(message)).toHaveCount(0);
    expect(await describedText(username)).not.toContain(message);
  });
});

test.describe("keyboard only", () => {
  test("sign up, sign out, sign in, then sign out everywhere", async ({ page, request }) => {
    const dude = newDude();

    // Sign up.
    await page.goto("/signup");
    await waitForHydration(page, "Sign up");
    await typeAndTab(page, page.getByLabel("Email"), dude.email);
    await typeAndTab(page, page.getByLabel("Display name"), dude.displayName);
    await typeAndTab(page, page.getByLabel("Username"), dude.username);
    await typeAndTab(page, page.getByLabel("Password", { exact: true }), dude.password);
    await tabTo(page, page.getByRole("button", { name: "Sign up", exact: true }));
    await page.keyboard.press("Enter");
    await expect(page.getByText("You're signed in.")).toBeVisible();
    await expect(page).toHaveURL("/");

    // Sign out.
    await tabTo(page, page.getByRole("button", { name: "Sign out", exact: true }));
    await page.keyboard.press("Enter");
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(page.getByText("You're signed in.")).toBeHidden();

    // Sign in, with Enter inside the password field.
    await tabTo(page, page.getByRole("link", { name: "Sign in" }));
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/login$/);
    await waitForHydration(page, "Sign in");
    await typeAndTab(page, page.getByLabel("Email"), dude.email);
    await typeAndTab(page, page.getByLabel("Password", { exact: true }), dude.password);
    await page.keyboard.press("Enter");
    await expect(page.getByText("You're signed in.")).toBeVisible();

    // Sign out everywhere, with Space.
    await tabTo(page, page.getByRole("button", { name: "Sign out everywhere" }));
    await page.keyboard.press("Space");
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(page.getByText("You're signed in.")).toBeHidden();

    // Nest agrees the user can still sign in (nothing was deleted).
    expect((await nestTokens(request, dude)).accessToken).toBeTruthy();
  });
});

test.describe("show or hide the password, with JavaScript on", () => {
  test("the eye button is a Tab stop after the field, toggles aria-pressed and the input type, and the form still posts the password", async ({
    page,
    request,
  }) => {
    const dude = await createDude(request);
    await page.goto("/login");
    await waitForHydration(page, "Sign in");

    const password = page.getByLabel("Password", { exact: true });
    const eye = page.getByRole("button", { name: "Show password" });
    await expect(eye).toBeVisible();
    await expect(eye).toHaveAttribute("aria-pressed", "false");
    await expect(eye).toHaveAttribute("aria-controls", (await password.getAttribute("id")) ?? "");

    await page.getByLabel("Email").fill(dude.email);
    await password.fill(dude.password);

    // Keyboard: the next Tab stop after the field is the eye button.
    await password.focus();
    await page.keyboard.press("Tab");
    await expect(eye).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(eye).toHaveAttribute("aria-pressed", "true");
    await expect(eye).toBeFocused();
    await expect(password).toHaveAttribute("type", "text");
    await expect(password).toHaveValue(dude.password);

    await page.keyboard.press("Space");
    await expect(eye).toHaveAttribute("aria-pressed", "false");
    await expect(password).toHaveAttribute("type", "password");

    // Show it once more, then submit: the form posts the typed password.
    await page.keyboard.press("Enter");
    await expect(password).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText("You're signed in.")).toBeVisible();
  });

  test("the eye button does not submit the form", async ({ page }) => {
    const posts: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST") posts.push(request.url());
    });
    await page.goto("/login");
    await waitForHydration(page, "Sign in");
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
    expect(posts).toEqual([]);
  });
});

test.describe("accessibility (axe)", () => {
  for (const theme of THEMES) {
    for (const motion of MOTIONS) {
      test.describe(`${theme}, motion ${motion}`, () => {
        test.use({
          colorScheme: theme,
          reducedMotion: motion,
        });

        async function setTheme(page: Page) {
          await page
            .context()
            .addCookies([{ name: "theme", value: theme, url: "http://localhost" }]);
        }

        async function expectNoViolations(page: Page) {
          const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
          expect(results.violations).toEqual([]);
        }

        for (const path of ["/", "/login", "/signup"]) {
          test(`${path} has no violations`, async ({ page }) => {
            await setTheme(page);
            await page.goto(path);
            await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
            await expectNoViolations(page);
          });
        }

        test("the sign-in error state has no violations", async ({ page }) => {
          await setTheme(page);
          const dude = newDude(); // never created: Nest answers 401
          await page.goto("/login");
          await waitForHydration(page, "Sign in");
          await fillSignIn(page, dude);
          await page.getByRole("button", { name: "Sign in", exact: true }).click();
          await expect(page.locator("form").getByRole("alert")).toHaveText(
            "That email or password doesn't match.",
          );
          await expectNoViolations(page);
        });

        test("the sign-up field error state has no violations", async ({ page }) => {
          await setTheme(page);
          const dude = newDude();
          dude.username = `e2e@${dude.username.slice(4)}`;
          await page.goto("/signup");
          await waitForHydration(page, "Sign up");
          await fillSignUp(page, dude);
          await page.locator("form").evaluate((form) => {
            (form as HTMLFormElement).noValidate = true;
          });
          await page.getByRole("button", { name: "Sign up", exact: true }).click();
          await expect(page.getByLabel("Username")).toHaveAttribute("aria-invalid", "true");
          await expect(page.getByText("username must not contain spaces or @")).toBeVisible();
          await expectNoViolations(page);
        });
      });
    }
  }
});
