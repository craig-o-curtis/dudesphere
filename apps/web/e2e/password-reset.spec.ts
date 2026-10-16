import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";

import { deleteMessagesTo, mailpitIsUp, waitForResetLink } from "./mailpit";

// Browser tests for AUTH-9: ask for a reset link, read it from Mailpit, set a
// new password, and sign in with it.
//
// They run against the real API at API_URL and Mailpit at MAILPIT_URL (both
// started with `pnpm db:up` and the API dev server). Without either, the whole
// file skips.
//
// The email's link points at FRONTEND_URL, the user's own `pnpm dev:web` on
// port 3001, not the test server. Each test checks the link's prefix, then
// opens the same path and query on Playwright's baseURL. No test drives 3001.
//
// Rate limit. Forgot allows 3 asks per 15 minutes, counted per email and
// address together. Every test that asks for a link makes its own user, so no
// count is shared. No guard is turned off.
//
// Test data: made-up users. The username is `e2e-<12 hex>` and the email is
// `e2e-<12 hex>@example.com`, so the shared e2e cleanup removes them. The
// emails to those addresses are deleted from Mailpit in afterAll.

const SKIP_API = "Start the API: pnpm db:up, then the API dev server";
const SKIP_MAILPIT = "Start Mailpit: pnpm db:up";
const PASSWORD = "a-long-secret-123";
const NEW_PASSWORD = "a-brand-new-secret-456";
const SESSION_COOKIE = "__Host-session";
const REFRESH_COOKIE = "__Secure-refresh";
const LINK_PREFIX = "http://localhost:3001/reset-password?token=";
const INVALID_LINK = "That link no longer works.";
const CHANGED = "Password changed. Roll in with the new one.";
const SENT_COPY = "If that address has an account, we sent it a link.";

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

let servicesUp = false;
let apiUp = false;

// Every address this worker's tests made, so afterAll deletes only their mail.
const addresses = new Set<string>();

test.beforeAll(async () => {
  apiUp = await apiIsUp();
  servicesUp = apiUp && (await mailpitIsUp());
});

test.beforeEach(() => {
  test.skip(!apiUp, SKIP_API);
  test.skip(!servicesUp, SKIP_MAILPIT);
});

test.afterAll(async () => {
  if (servicesUp) await deleteMessagesTo(addresses);
});

interface Dude {
  username: string;
  email: string;
  displayName: string;
  password: string;
}

function newDude(): Dude {
  const tag = randomBytes(6).toString("hex"); // 12 lower-case hex characters
  const dude = {
    username: `e2e-${tag}`,
    email: `e2e-${tag}@example.com`,
    displayName: `e2e ${tag}`,
    password: PASSWORD,
  };
  addresses.add(dude.email);
  return dude;
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

function nestToken(request: APIRequestContext, email: string, password: string) {
  return request.post(`${API_URL}/auth/token`, { data: { identifier: email, password } });
}

// Waits until React has attached to the form's button, so a click runs the
// client handler and the action state shows. Same signal as auth.spec.ts.
async function waitForHydration(page: Page, buttonName: string) {
  const button = page.getByRole("button", { name: buttonName, exact: true });
  await expect
    .poll(() =>
      button.evaluate((el) => Object.keys(el).some((key) => key.startsWith("__reactProps"))),
    )
    .toBe(true);
}

function postStatus(page: Page, path: string) {
  return page.waitForResponse(
    (r) => r.request().method() === "POST" && new URL(r.url()).pathname === path,
  );
}

// Presses Tab until the target has focus, so a test uses the keyboard only.
async function tabTo(page: Page, target: Locator, limit = 40) {
  for (let step = 0; step < limit; step += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((el) => el === document.activeElement)) return;
  }
  await expect(target, `not reached by Tab in ${limit} presses`).toBeFocused();
}

async function typeAndTab(page: Page, field: Locator, text: string) {
  await tabTo(page, field);
  await page.keyboard.type(text);
}

function describedText(input: Locator): Promise<string[]> {
  return input.evaluate((el) =>
    (el.getAttribute("aria-describedby") ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? ""),
  );
}

// Asks for a link on the page, then returns the path and query to open on the
// test server. The emailed link must start with the user's FRONTEND_URL.
async function askForLink(page: Page, dude: Dude): Promise<string> {
  await page.goto("/forgot-password");
  await waitForHydration(page, "Send the link");
  await page.getByLabel("Email").fill(dude.email);
  await page.getByRole("button", { name: "Send the link", exact: true }).click();
  await expect(page).toHaveURL(/\/forgot-password\/sent$/);
  return localPath(await waitForResetLink(dude.email));
}

function localPath(link: string): string {
  expect(link.startsWith(LINK_PREFIX), `link ${link.slice(0, 50)}...`).toBe(true);
  const url = new URL(link);
  return `${url.pathname}${url.search}`;
}

async function fillReset(page: Page, password: string, again = password) {
  await page.getByLabel("New password", { exact: true }).fill(password);
  await page.getByLabel("Same again", { exact: true }).fill(again);
}

async function signIn(page: Page, email: string, password: string) {
  await waitForHydration(page, "Sign in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test.describe("the whole flow", () => {
  test("the link, the new password, the old one refused, and a reused link", async ({
    page,
    request,
    baseURL,
  }) => {
    const dude = await createDude(request);

    await page.goto("/forgot-password");
    await waitForHydration(page, "Send the link");
    await page.getByLabel("Email").fill(dude.email);
    await page.getByRole("button", { name: "Send the link", exact: true }).click();
    await expect(page).toHaveURL(/\/forgot-password\/sent$/);
    await expect(page.getByText(SENT_COPY)).toBeVisible();

    const link = await waitForResetLink(dude.email);
    expect(link.startsWith(LINK_PREFIX)).toBe(true);
    const path = localPath(link);

    // The page's response carries the header that stops the token leaking in Referer.
    const response = await page.goto(path);
    expect(response?.headers()["referrer-policy"]).toBe("strict-origin");

    // Once the form is on screen the token leaves the address bar.
    await waitForHydration(page, "Change password");
    await expect(page).toHaveURL(`${baseURL}/reset-password`);
    expect(new URL(page.url()).search).toBe("");

    // The form still submits: the token is kept in the page, not the URL.
    await fillReset(page, NEW_PASSWORD);
    await page.getByRole("button", { name: "Change password", exact: true }).click();
    await expect(page).toHaveURL(/\/login\?reset=1$/);
    await expect(page.getByText(CHANGED)).toBeVisible();

    // The new password signs in through the page.
    await signIn(page, dude.email, NEW_PASSWORD);
    await expect(page.getByText("You're signed in.")).toBeVisible();

    // Checked at Nest, from the runner: the old password is refused.
    expect((await nestToken(request, dude.email, PASSWORD)).status()).toBe(401);
    expect((await nestToken(request, dude.email, NEW_PASSWORD)).status()).toBe(200);

    // The same link a second time.
    await page.goto(path);
    await waitForHydration(page, "Change password");
    await fillReset(page, "yet-another-secret-789");
    await page.getByRole("button", { name: "Change password", exact: true }).click();
    await expect(page.getByText(INVALID_LINK)).toBeVisible();
    await expect(page.getByLabel("New password", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Ask for a new link" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
    // The reused link changed nothing.
    expect((await nestToken(request, dude.email, NEW_PASSWORD)).status()).toBe(200);
  });

  test("a reload after the token is stripped shows the invalid state", async ({
    page,
    request,
  }) => {
    const dude = await createDude(request);
    const path = await askForLink(page, dude);

    await page.goto(path);
    await waitForHydration(page, "Change password");
    await expect(page).toHaveURL(/\/reset-password$/);

    await page.reload();
    await expect(page.getByText(INVALID_LINK)).toBeVisible();
    await expect(page.getByLabel("New password", { exact: true })).toHaveCount(0);
  });
});

test.describe("/reset-password with no usable token", () => {
  test("no token shows the invalid state and no form", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.getByText(INVALID_LINK)).toBeVisible();
    await expect(page.getByLabel("New password", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Change password" })).toHaveCount(0);
  });

  test("an empty token shows the same", async ({ page }) => {
    await page.goto("/reset-password?token=");
    await expect(page.getByText(INVALID_LINK)).toBeVisible();
    await expect(page.getByRole("button", { name: "Change password" })).toHaveCount(0);
  });

  test("a token Nest never made shows the invalid state after the post", async ({ page }) => {
    await page.goto("/reset-password?token=not-a-real-token-at-all-not-a-real-token-1234");
    await waitForHydration(page, "Change password");
    await fillReset(page, NEW_PASSWORD);
    await page.getByRole("button", { name: "Change password", exact: true }).click();
    await expect(page.getByText(INVALID_LINK)).toBeVisible();
  });
});

test.describe("/forgot-password", () => {
  test("an address with no account lands on the same /sent page", async ({ page }) => {
    const stranger = newDude(); // never created
    await page.goto("/forgot-password");
    await waitForHydration(page, "Send the link");
    await page.getByLabel("Email").fill(stranger.email);
    await page.getByRole("button", { name: "Send the link", exact: true }).click();
    await expect(page).toHaveURL(/\/forgot-password\/sent$/);
    await expect(page.getByText(SENT_COPY)).toBeVisible();
  });

  test("/login links to it", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
  });
});

test.describe("the new password field", () => {
  test("mismatched passwords show the message, and the link still works afterwards", async ({
    page,
    request,
  }) => {
    const dude = await createDude(request);
    const path = await askForLink(page, dude);

    await page.goto(path);
    await waitForHydration(page, "Change password");
    await fillReset(page, NEW_PASSWORD, "a-different-secret-789");
    await page.getByRole("button", { name: "Change password", exact: true }).click();

    const again = page.getByLabel("Same again", { exact: true });
    await expect(again).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("The two passwords don't match.")).toBeVisible();
    await expect(page).toHaveURL(/\/reset-password$/);
    // Nest was not asked: the password is unchanged and the token is unspent.
    expect((await nestToken(request, dude.email, PASSWORD)).status()).toBe(200);

    await fillReset(page, NEW_PASSWORD);
    await page.getByRole("button", { name: "Change password", exact: true }).click();
    await expect(page).toHaveURL(/\/login\?reset=1$/);
    expect((await nestToken(request, dude.email, NEW_PASSWORD)).status()).toBe(200);
  });

  test("an 11-character password shows Nest's message under New password", async ({
    page,
    request,
  }) => {
    const dude = await createDude(request);
    const path = await askForLink(page, dude);

    await page.goto(path);
    await waitForHydration(page, "Change password");
    await fillReset(page, "elevenchars");
    // The browser's own minLength would stop this post. Switch its checks off
    // for this one form, so the request reaches Nest and Nest's answer shows.
    await page.locator("form").evaluate((form) => {
      (form as HTMLFormElement).noValidate = true;
    });
    await page.getByRole("button", { name: "Change password", exact: true }).click();

    const field = page.getByLabel("New password", { exact: true });
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(field).toBeFocused();
    const messages = await describedText(field);
    expect(messages.join(" ")).toMatch(/12/);
    // The token survived the 400, so a good password now works.
    await fillReset(page, NEW_PASSWORD);
    await page.getByRole("button", { name: "Change password", exact: true }).click();
    await expect(page).toHaveURL(/\/login\?reset=1$/);
  });
});

// Asks Nest for the link directly, for the tests that need no forgot form.
async function askNestForLink(request: APIRequestContext, dude: Dude): Promise<string> {
  const response = await request.post(`${API_URL}/auth/password/forgot`, {
    data: { email: dude.email },
  });
  expect(response.status()).toBe(202);
  return localPath(await waitForResetLink(dude.email));
}

test.describe("with JavaScript off", () => {
  test.use({ javaScriptEnabled: false });

  // Pins a known limit. Next streams the form's <Suspense> hole inside
  // `<div hidden>`, and only a script unhides it, so with JavaScript off the
  // form never shows. The page's <noscript> fallback says why. If Next changes
  // how it streams holes, this fails and the limit can be revisited.
  test("the noscript line on /reset-password starts at the heading's left edge", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/reset-password?token=e2eNotARealToken000000000000000000000000000");

    const heading = await page
      .getByRole("heading", { level: 1, name: "Reset password" })
      .boundingBox();
    const line = await page
      .locator("noscript p", { hasText: "Turn on JavaScript to set a new password." })
      .boundingBox();

    expect(heading).not.toBeNull();
    expect(line).not.toBeNull();
    expect(Math.abs((line?.x ?? 0) - (heading?.x ?? 0))).toBeLessThan(1);
  });

  test("/reset-password says to turn on JavaScript, and shows no form", async ({
    page,
    request,
  }) => {
    const dude = await createDude(request);
    await page.goto(await askNestForLink(request, dude));
    // getByText skips <noscript>, so find the line by its tags.
    await expect(
      page.locator("noscript p", { hasText: "Turn on JavaScript to set a new password." }),
    ).toBeVisible();
    await expect(page.getByLabel("New password", { exact: true })).toBeHidden();
  });

  test("the forgot form succeeds with a 303 to /sent", async ({ page, request }) => {
    const dude = await createDude(request);

    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(dude.email);
    const [asked] = await Promise.all([
      postStatus(page, "/forgot-password"),
      page.getByRole("button", { name: "Send the link", exact: true }).click(),
    ]);
    expect(asked.status()).toBe(303);
    await expect(page).toHaveURL(/\/forgot-password\/sent$/);
    await expect(page.getByText(SENT_COPY)).toBeVisible();
    // The email went out.
    expect(await waitForResetLink(dude.email)).toContain(LINK_PREFIX);
  });
});

test.describe("keyboard only", () => {
  test("from /login to a new password and back in, with Tab and Enter", async ({
    page,
    request,
  }) => {
    const dude = await createDude(request);

    // Login -> Forgot password?
    await page.goto("/login");
    await waitForHydration(page, "Sign in");
    await tabTo(page, page.getByRole("link", { name: "Forgot password?" }));
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/forgot-password$/);

    // Ask for the link.
    await waitForHydration(page, "Send the link");
    await typeAndTab(page, page.locator('input[name="email"]:visible'), dude.email);
    await tabTo(page, page.getByRole("button", { name: "Send the link", exact: true }));
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/forgot-password\/sent$/);
    const path = localPath(await waitForResetLink(dude.email));

    // Set the new password.
    await page.goto(path);
    await waitForHydration(page, "Change password");
    await typeAndTab(page, page.getByLabel("New password", { exact: true }), NEW_PASSWORD);
    await typeAndTab(page, page.getByLabel("Same again", { exact: true }), NEW_PASSWORD);
    await tabTo(page, page.getByRole("button", { name: "Change password", exact: true }));
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/login\?reset=1$/);
    await expect(page.getByText(CHANGED)).toBeVisible();

    // Sign in with it, with Enter inside the password field.
    await waitForHydration(page, "Sign in");
    await typeAndTab(page, page.locator('input[name="identifier"]:visible'), dude.email);
    await typeAndTab(page, page.locator('input[name="password"]:visible'), NEW_PASSWORD);
    await page.keyboard.press("Enter");
    await expect(page.getByText("You're signed in.")).toBeVisible();
  });
});

// Proofs for the owasp-hacker findings on AUTH-9 round 1.
test.describe("security", () => {
  async function cookieValue(context: BrowserContext, name: string): Promise<string> {
    const cookie = (await context.cookies()).find((entry) => entry.name === name);
    expect(cookie, name).toBeDefined();
    return (cookie as { value: string }).value;
  }

  // The same access token with `exp` set before `iat`: what the 7-day session
  // cookie holds once its 15-minute token has run out. Proxy and the refresh
  // handler read it without checking the signature, as they do a real one.
  function expiredCopy(accessToken: string): string {
    const [header, payload, signature] = accessToken.split(".");
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      iat: number;
    };
    const stale = Buffer.from(JSON.stringify({ ...claims, exp: claims.iat - 60 })).toString(
      "base64url",
    );
    return `${header}.${stale}.${signature}`;
  }

  test("SEC-1: a reset link opened with a stale session reaches the reset form, not /login with the token", async ({
    page,
    request,
  }) => {
    const dude = await createDude(request);
    await page.goto("/login");
    await signIn(page, dude.email, dude.password);
    await expect(page.getByText("You're signed in.")).toBeVisible();
    const accessToken = await cookieValue(page.context(), SESSION_COOKIE);
    await cookieValue(page.context(), REFRESH_COOKIE);

    // The sign-in ends somewhere else (sign out everywhere, or an earlier
    // reset), and later the access token in this browser runs out.
    const ended = await request.post(`${API_URL}/auth/sign-out`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(ended.status()).toBe(204);
    await page.context().addCookies([
      {
        name: SESSION_COOKIE,
        value: expiredCopy(accessToken),
        domain: "localhost",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      },
    ]);

    const path = await askNestForLink(request, dude);
    const token = new URL(path, "http://localhost").searchParams.get("token") as string;
    await page.goto(path);

    // It must not go through /api/auth/refresh to /login?next=...token...
    await expect(page).toHaveURL((url) => url.pathname === "/reset-password");
    await expect(page.getByLabel("New password", { exact: true })).toBeVisible();
    // The strip runs once the page hydrates; after it the token is gone.
    await waitForHydration(page, "Change password");
    await expect(page).toHaveURL((url) => url.search === "");
    expect(page.url()).not.toContain(token);
  });

  test("SEC-2: the reset Server Action posts to /reset-password without the token", async ({
    page,
  }) => {
    // Made up, never sent to Nest: a mismatch makes no API call.
    const token = randomBytes(32).toString("base64url");
    await page.goto(`/reset-password?token=${token}`);
    await waitForHydration(page, "Change password");
    await expect(page).toHaveURL((url) => url.search === "");

    const actionPost = page.waitForRequest((request) => request.method() === "POST");
    await fillReset(page, NEW_PASSWORD, `${NEW_PASSWORD}x`);
    await page.getByRole("button", { name: "Change password", exact: true }).click();

    expect((await actionPost).url()).not.toContain(token);
  });

  test("SEC-3: a reset with another member's link also ends the sign-in this browser had", async ({
    page,
    request,
  }) => {
    const owner = await createDude(request);
    const signedIn = await createDude(request);
    await page.goto("/login");
    await signIn(page, signedIn.email, signedIn.password);
    await expect(page.getByText("You're signed in.")).toBeVisible();
    const signedInToken = await cookieValue(page.context(), SESSION_COOKIE);

    await page.goto(await askNestForLink(request, owner));
    await waitForHydration(page, "Change password");
    await fillReset(page, NEW_PASSWORD);
    await page.getByRole("button", { name: "Change password", exact: true }).click();
    await expect(page).toHaveURL(/\/login\?reset=1$/);
    expect(await page.context().cookies()).toEqual([]);

    // The cookies are gone, so Sign out here can no longer reach the other
    // member's sign-in. Nest must refuse its access token now.
    const me = await request.get(`${API_URL}/users/me`, {
      headers: { Authorization: `Bearer ${signedInToken}` },
    });
    expect(me.status()).toBe(401);
  });
});
