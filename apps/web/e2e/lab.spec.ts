import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Browser tests for WEB-11: /lab is for admins. They sign up `e2e-` users through the page, and
// make one an admin with `pnpm --filter @dudesphere/api e2e:set-role` (local databases only).
// The shared e2e cleanup removes the users (see auth.spec.ts). No guard is turned off.
//
// The status of a member's visit stays 200: `forbidden()` runs inside <Suspense>, after
// streaming starts. So these tests check the page, the noindex tag and the response body.

const PASSWORD = "a-long-secret-123";
const REPO_ROOT = resolve(__dirname, "../../..");
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
// Text that only the rows hold: a `why` from lab.ts, and a planned route name.
const ROW_TEXT = "The questions are ours and change only with a deploy";
const FORBIDDEN_COPY = "There are rules, and this room is one of them.";

function apiIsConfigured(): boolean {
  if (process.env.API_URL) return true;
  try {
    return /^\s*API_URL\s*=/m.test(readFileSync(join(__dirname, "..", ".env.local"), "utf8"));
  } catch {
    return false;
  }
}

test.beforeEach(() => {
  test.skip(!apiIsConfigured(), "Start the API: pnpm db:up, then the API dev server");
});

function newDude() {
  const tag = randomBytes(6).toString("hex");
  return {
    username: `e2e-${tag}`,
    email: `e2e-${tag}@example.com`,
    displayName: `e2e ${tag}`,
    password: PASSWORD,
  };
}

async function signUp(page: Page) {
  const dude = newDude();
  await page.goto("/signup");
  const button = page.getByRole("button", { name: "Sign up", exact: true });
  await expect
    .poll(() =>
      button.evaluate((el) => Object.keys(el).some((key) => key.startsWith("__reactProps"))),
    )
    .toBe(true);
  await page.getByLabel("Email").fill(dude.email);
  await page.getByLabel("Display name").fill(dude.displayName);
  await page.getByLabel("Username").fill(dude.username);
  await page.getByLabel("Password", { exact: true }).fill(dude.password);
  await button.click();
  await expect(page.getByText("You're signed in.")).toBeVisible();
  return dude;
}

function makeAdmin(email: string) {
  const result = spawnSync(
    "pnpm",
    ["--filter", "@dudesphere/api", "e2e:set-role", "--email", email, "--role", "admin"],
    { cwd: REPO_ROOT, stdio: "inherit" },
  );
  if (result.error) throw new Error(`e2e:set-role could not start: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`e2e:set-role failed (exit ${result.status})`);
}

test("a signed-out visit ends on /login?next=%2Flab", async ({ page }) => {
  await page.goto("/lab");
  await expect(page).toHaveURL(/\/login\?next=%2Flab$/);
});

test("a member sees the forbidden page, a noindex tag and no row text", async ({ page }) => {
  await signUp(page);
  const response = await page.goto("/lab");
  await expect(page.getByText(FORBIDDEN_COPY)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1, name: "Off limits" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to the feed" })).toHaveAttribute(
    "href",
    "/feed",
  );
  await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
  await expect(page.getByText(ROW_TEXT)).toHaveCount(0);
  const body = (await response?.text()) ?? "";
  expect(body).not.toContain(ROW_TEXT);
  expect(body).not.toContain("/laws/quiz/[step]");
});

test.describe("an admin", () => {
  for (const theme of ["light", "dark"] as const) {
    test.describe(theme, () => {
      test.use({ colorScheme: theme });

      test("sees every group, tabs to every link, and axe is clean", async ({ page }) => {
        const dude = await signUp(page);
        makeAdmin(dude.email);
        await page.context().addCookies([{ name: "theme", value: theme, url: "http://localhost" }]);
        await page.goto("/lab");

        await expect(page.getByRole("heading", { level: 1, name: "Rendering lab" })).toBeVisible();
        await expect(page.getByText(ROW_TEXT)).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

        const strategies = await page.getByRole("heading", { level: 2 }).count();
        expect(strategies).toBe(23);
        await expect(page.getByRole("region")).toHaveCount(23);

        // Keyboard only: Tab until every link in the lab has had focus.
        const links = page.getByRole("region").getByRole("link");
        const total = await links.count();
        expect(total).toBeGreaterThan(0);
        const reached = new Set<string>();
        await page
          .locator("main")
          .first()
          .focus()
          .catch(() => {});
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        for (let i = 0; i < 400 && reached.size < total; i++) {
          await page.keyboard.press("Tab");
          const inLab = await page.evaluate(() => {
            const el = document.activeElement;
            return el instanceof HTMLAnchorElement && el.closest("section[aria-labelledby]")
              ? `${el.closest("section")?.getAttribute("aria-labelledby")}|${el.getAttribute("href")}|${[...(el.closest("ul")?.querySelectorAll("a") ?? [])].indexOf(el)}`
              : null;
          });
          if (inLab) reached.add(inLab);
        }
        expect(reached.size).toBe(total);

        const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
        expect(results.violations).toEqual([]);

        // WCAG 1.4.10 Reflow: at 320 px wide the page must not scroll sideways.
        await page.setViewportSize({ width: 320, height: 700 });
        await expect(page.getByText(ROW_TEXT)).toBeVisible();
        const widths = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          inner: window.innerWidth,
        }));
        expect(widths.scroll).toBeLessThanOrEqual(widths.inner);
      });
    });
  }
});
