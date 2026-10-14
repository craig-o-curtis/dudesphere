import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const LIGHT_BG = "rgb(246, 240, 228)";
const SAVE_FAILED = "Could not save your theme. Try again.";
const DARK_BG = "rgb(20, 17, 31)";

const DISCLAIMER =
  "Dudesphere is a fan community inspired by The Big Lebowski. It is not affiliated with the film, its makers or Universal, nor with Dudeism and the Church of the Latter-Day Dude.";

function lightButton(page: Page) {
  return page.getByRole("group", { name: "Theme" }).getByRole("button", { name: "Light" });
}

function darkButton(page: Page) {
  return page.getByRole("group", { name: "Theme" }).getByRole("button", { name: "Dark" });
}

function html(page: Page) {
  return page.locator("html");
}

function bodyBackground(page: Page) {
  return page.locator("body").evaluate((el) => getComputedStyle(el).backgroundColor);
}

async function themeCookie(page: Page) {
  const cookies = await page.context().cookies();
  return cookies.find((cookie) => cookie.name === "theme")?.value;
}

async function saveTheme(page: Page, value: string) {
  await page.context().addCookies([{ name: "theme", value, url: "http://localhost" }]);
}

async function contextThemeCookie(context: BrowserContext) {
  const cookies = await context.cookies();
  return cookies.find((cookie) => cookie.name === "theme")?.value;
}

// Holds the app's JavaScript back, as a slow network would. The HTML arrives,
// the code that makes the toggle work does not.
async function delayAppScripts(page: Page) {
  await page.route("**/_next/static/chunks/*.js", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 8000));
    await route.continue().catch(() => undefined);
  });
}

// Lets the browser paint twice, so a snap-back from a re-render would show.
function nextFrames(page: Page) {
  return page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

// Waits until React has attached to the toggle, so a click runs the client handler.
async function waitForHydration(page: Page) {
  await expect
    .poll(() =>
      darkButton(page).evaluate((el) =>
        Object.keys(el).some((key) => key.startsWith("__reactProps")),
      ),
    )
    .toBe(true);
}

test.describe("theme toggle", () => {
  test.use({ colorScheme: "light" });

  test("Light and Dark each set data-theme and the background, and survive a reload", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForHydration(page);

    await darkButton(page).click();
    await expect(html(page)).toHaveAttribute("data-theme", "dark");
    await expect(darkButton(page)).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => bodyBackground(page)).toBe(DARK_BG);
    await expect.poll(() => themeCookie(page)).toBe("dark");

    await page.reload();
    await expect(html(page)).toHaveAttribute("data-theme", "dark");
    await expect(darkButton(page)).toHaveAttribute("aria-pressed", "true");
    expect(await bodyBackground(page)).toBe(DARK_BG);

    await lightButton(page).click();
    await expect(html(page)).toHaveAttribute("data-theme", "light");
    await expect(lightButton(page)).toHaveAttribute("aria-pressed", "true");
    await expect(darkButton(page)).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => bodyBackground(page)).toBe(LIGHT_BG);
    await expect.poll(() => themeCookie(page)).toBe("light");

    await page.reload();
    await expect(html(page)).toHaveAttribute("data-theme", "light");
    await expect(lightButton(page)).toHaveAttribute("aria-pressed", "true");
    expect(await bodyBackground(page)).toBe(LIGHT_BG);
  });

  test("pressing the pressed button again clears the cookie and the OS decides", async ({
    page,
  }) => {
    await saveTheme(page, "dark");
    await page.goto("/");
    await waitForHydration(page);
    await expect(darkButton(page)).toHaveAttribute("aria-pressed", "true");

    await darkButton(page).click();
    await expect(darkButton(page)).toHaveAttribute("aria-pressed", "false");
    await expect(lightButton(page)).toHaveAttribute("aria-pressed", "false");
    await expect(html(page)).not.toHaveAttribute("data-theme", /.*/);
    await expect.poll(() => themeCookie(page)).toBeUndefined();
    // The OS is light, so the page is light again.
    await expect.poll(() => bodyBackground(page)).toBe(LIGHT_BG);

    await page.reload();
    await expect(html(page)).not.toHaveAttribute("data-theme", /.*/);
    await expect(darkButton(page)).toHaveAttribute("aria-pressed", "false");
    await expect(lightButton(page)).toHaveAttribute("aria-pressed", "false");
  });

  test("keeps the click on screen while the save is slow (no snap-back)", async ({ page }) => {
    await page.route("**/", async (route) => {
      if (route.request().method() === "POST") {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      await route.continue();
    });

    await saveTheme(page, "dark");
    await page.goto("/");
    await waitForHydration(page);
    await expect(darkButton(page)).toHaveAttribute("aria-pressed", "true");

    // Dark -> Light, while the POST is held back.
    const firstPost = page.waitForResponse((r) => r.request().method() === "POST");
    await lightButton(page).click();
    await expect(lightButton(page)).toHaveAttribute("aria-pressed", "true");
    await expect(darkButton(page)).toHaveAttribute("aria-pressed", "false");
    await expect(html(page)).toHaveAttribute("data-theme", "light");
    await nextFrames(page); // still inside the 1.5 s hold
    await expect(lightButton(page)).toHaveAttribute("aria-pressed", "true");
    await expect(darkButton(page)).toHaveAttribute("aria-pressed", "false");
    await expect(html(page)).toHaveAttribute("data-theme", "light");
    await firstPost;
    await expect.poll(() => themeCookie(page)).toBe("light");
    await expect(lightButton(page)).toHaveAttribute("aria-pressed", "true");

    // Light -> back to the OS, while the POST is held back.
    const secondPost = page.waitForResponse((r) => r.request().method() === "POST");
    await lightButton(page).click();
    await expect(lightButton(page)).toHaveAttribute("aria-pressed", "false");
    await expect(darkButton(page)).toHaveAttribute("aria-pressed", "false");
    await expect(html(page)).not.toHaveAttribute("data-theme", /.*/);
    await nextFrames(page);
    await expect(lightButton(page)).toHaveAttribute("aria-pressed", "false");
    await expect(html(page)).not.toHaveAttribute("data-theme", /.*/);
    await secondPost;
    await expect.poll(() => themeCookie(page)).toBeUndefined();
    await expect(lightButton(page)).toHaveAttribute("aria-pressed", "false");
    await expect(html(page)).not.toHaveAttribute("data-theme", /.*/);
  });
});

test.describe("with no saved theme, the OS decides", () => {
  test.describe("dark OS", () => {
    test.use({ colorScheme: "dark" });

    test("gives the dark background and presses neither button", async ({ page }) => {
      await page.goto("/");
      await expect(html(page)).not.toHaveAttribute("data-theme", /.*/);
      expect(await bodyBackground(page)).toBe(DARK_BG);
      await expect(lightButton(page)).toHaveAttribute("aria-pressed", "false");
      await expect(darkButton(page)).toHaveAttribute("aria-pressed", "false");
    });

    test("a chosen Light beats the OS", async ({ page }) => {
      await saveTheme(page, "light");
      await page.goto("/");
      await expect(html(page)).toHaveAttribute("data-theme", "light");
      expect(await bodyBackground(page)).toBe(LIGHT_BG);
    });
  });

  test.describe("light OS", () => {
    test.use({ colorScheme: "light" });

    test("gives the light background and presses neither button", async ({ page }) => {
      await page.goto("/");
      await expect(html(page)).not.toHaveAttribute("data-theme", /.*/);
      expect(await bodyBackground(page)).toBe(LIGHT_BG);
      await expect(lightButton(page)).toHaveAttribute("aria-pressed", "false");
      await expect(darkButton(page)).toHaveAttribute("aria-pressed", "false");
    });

    test("a chosen Dark beats the OS", async ({ page }) => {
      await saveTheme(page, "dark");
      await page.goto("/");
      await expect(html(page)).toHaveAttribute("data-theme", "dark");
      expect(await bodyBackground(page)).toBe(DARK_BG);
    });
  });
});

test.describe("with JavaScript off", () => {
  test.use({ javaScriptEnabled: false });

  // JS off cannot run the inline theme script or submit the form through the
  // client, so the app hides the toggle and the OS decides. A direct POST to a
  // Server Action is not practical to build by hand (it needs the action id and
  // a body shape Next owns), so there is no form-post test here.
  test.describe("light OS", () => {
    test.use({ colorScheme: "light" });

    test("hides the Theme group and follows the OS, even with a dark cookie", async ({ page }) => {
      await saveTheme(page, "dark");
      await page.goto("/");
      await expect(page.getByRole("group", { name: "Theme" })).toBeHidden();
      expect(await bodyBackground(page)).toBe(LIGHT_BG);
    });
  });

  test.describe("dark OS", () => {
    test.use({ colorScheme: "dark" });

    test("hides the Theme group and follows the OS, even with a light cookie", async ({ page }) => {
      await saveTheme(page, "light");
      await page.goto("/");
      await expect(page.getByRole("group", { name: "Theme" })).toBeHidden();
      expect(await bodyBackground(page)).toBe(DARK_BG);
    });
  });
});

test.describe("early and stale presses", () => {
  test.use({ colorScheme: "light" });

  test("a press before the app's JavaScript loads leaves the page intact and the cookie unchanged", async ({
    page,
  }) => {
    let posts = 0;
    page.on("request", (request) => {
      if (request.method() === "POST") posts += 1;
    });
    await delayAppScripts(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // The served buttons already say they are not live.
    await expect(lightButton(page)).toHaveAttribute("aria-disabled", "true");
    await expect(darkButton(page)).toHaveAttribute("aria-disabled", "true");
    await darkButton(page).click({ force: true, noWaitAfter: true });
    await page.waitForTimeout(500);

    await expect(page.getByRole("heading", { name: "The Dudesphere" })).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible();
    expect(posts).toBe(0);
    expect(await themeCookie(page)).toBeUndefined();
  });

  test("two tabs: a stale Dark press asks for the OS, and the screen and cookie agree", async ({
    context,
  }) => {
    await context.addCookies([{ name: "theme", value: "dark", url: "http://localhost" }]);
    const first = await context.newPage();
    const second = await context.newPage();
    await first.goto("/");
    await second.goto("/");
    await waitForHydration(first);
    await waitForHydration(second);

    // The first tab hands control back to the OS.
    await darkButton(first).click();
    await expect.poll(() => contextThemeCookie(context)).toBeUndefined();

    // The second tab still shows Dark pressed. It asks for the OS too, and
    // that is what the screen and the cookie both end up showing.
    await darkButton(second).click();
    await expect(darkButton(second)).toHaveAttribute("aria-pressed", "false");
    await expect(html(second)).not.toHaveAttribute("data-theme", /.*/);
    expect(await contextThemeCookie(context)).toBeUndefined();
  });

  test("a change in one tab shows in the other when it comes back to the front", async ({
    context,
  }) => {
    const first = await context.newPage();
    const second = await context.newPage();
    await first.goto("/");
    await second.goto("/");
    await waitForHydration(first);
    await waitForHydration(second);

    await first.bringToFront();
    await darkButton(first).click();
    await expect.poll(() => contextThemeCookie(context)).toBe("dark");
    await expect(html(second)).not.toHaveAttribute("data-theme", /.*/);

    // bringToFront does not always fire visibilitychange or focus in headless
    // Chromium, so send both events as a returning tab would.
    await second.bringToFront();
    await second.evaluate(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    });
    await expect(html(second)).toHaveAttribute("data-theme", "dark");
    await expect(darkButton(second)).toHaveAttribute("aria-pressed", "true");
  });

  test("three quick presses with the middle save failing end on what the last press asked for", async ({
    context,
    page,
  }) => {
    let posts = 0;
    await page.route("http://localhost:*/", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      posts += 1;
      if (posts === 2) {
        // Fail late, so the third press is made while the second is in flight.
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await route.abort("internetdisconnected");
      } else {
        await route.continue();
      }
    });
    await page.goto("/");
    await waitForHydration(page);

    await darkButton(page).click();
    await lightButton(page).click();
    await lightButton(page).click(); // Light is pressed on screen now, so this asks for the OS.

    await expect.poll(() => posts).toBe(3);
    await expect.poll(() => contextThemeCookie(context)).toBeUndefined();
    await expect(lightButton(page)).toHaveAttribute("aria-pressed", "false");
    await expect(darkButton(page)).toHaveAttribute("aria-pressed", "false");
    await expect(html(page)).not.toHaveAttribute("data-theme", /.*/);
  });

  test("the streaming fallback of a dark page cannot act, so the saved dark survives", async ({
    context,
    page,
  }) => {
    await context.addCookies([{ name: "theme", value: "dark", url: "http://localhost" }]);
    let posts = 0;
    page.on("request", (request) => {
      if (request.method() === "POST") posts += 1;
    });
    await delayAppScripts(page);
    // Cut the streamed theme hole off, so the page keeps the fallback toggle.
    await page.route("http://localhost:*/", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      const body = await response.text();
      const cut = body.indexOf('<div hidden id="S:0">');
      await route.fulfill({ response, body: cut > 0 ? body.slice(0, cut) : body });
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(html(page)).toHaveAttribute("data-theme", "dark");
    await expect(darkButton(page)).toHaveAttribute("aria-disabled", "true");

    await darkButton(page).click({ force: true, noWaitAfter: true });
    // Force skips Playwright's wait for an enabled button, which would last
    // until the scripts arrive. This press lands on the fallback, inside the delay.
    await page.waitForTimeout(500);

    expect(posts).toBe(0);
    expect(await contextThemeCookie(context)).toBe("dark");
    await expect(html(page)).toHaveAttribute("data-theme", "dark");
  });

  test("Tab skips the placeholder toggle, then reaches the real one when it streams in", async ({
    context,
    page,
  }) => {
    await context.addCookies([{ name: "theme", value: "dark", url: "http://localhost" }]);
    await delayAppScripts(page);
    // Hold the streamed theme hole back, and keep it to release by hand.
    let held = "";
    let served = "";
    await page.route("http://localhost:*/", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      const body = await response.text();
      served = body;
      const cut = body.indexOf('<div hidden id="S:0">');
      held = cut > 0 ? body.slice(cut) : "";
      await route.fulfill({ response, body: cut > 0 ? body.slice(0, cut) : body });
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(held).not.toBe("");
    await expect(page.locator("[data-theme-toggle][inert]")).toHaveCount(1);

    // Skip link, then #main has nothing focusable, so Tab must pass the placeholder.
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.closest("[data-theme-toggle]"))).toBe(
      null,
    );
    await expect(lightButton(page)).not.toBeFocused();
    await expect(darkButton(page)).not.toBeFocused();

    // Release the hole: run the held markup and its swap script.
    await page.evaluate((markup) => {
      const fragment = document.createRange().createContextualFragment(markup);
      document.body.append(fragment);
    }, held);
    await expect(page.locator("[data-theme-toggle]:not([inert])")).toHaveCount(1);
    await expect(page.locator("[data-theme-toggle][inert]")).toHaveCount(0);

    // Focus may have left the page after the last Tab, so the first Tab here can
    // land on the skip link again. Light is the first stop after it.
    const skipLink = page.getByRole("link", { name: "Skip to content" });
    await page.keyboard.press("Tab");
    if (await skipLink.evaluate((el) => el === document.activeElement)) {
      await page.keyboard.press("Tab");
    }
    await expect(lightButton(page)).toBeFocused();

    // We add no inline script of our own beyond the theme init script. Next's
    // own scripts are told apart by their content: they set self.__next_f, or
    // are the $RC/$RB/$RV/$RS boundary helpers, or carry a $RC(...) call.
    const inline = [...served.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
      .map((match) => match[1] ?? "")
      .filter((code) => code.trim() !== "")
      .filter((code) => !/self\.__next_f|\$R[CBVST]|TURBOPACK/.test(code));
    expect(inline).toHaveLength(1);
    expect(inline[0]).toContain('"data-theme"');
  });

  test("a percent-encoded dark cookie paints dark from the first frame", async ({ page }) => {
    await saveTheme(page, "%64ark");
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        document.documentElement.dataset.firstBg = getComputedStyle(document.body).backgroundColor;
      });
    });
    await page.goto("/");
    await waitForHydration(page);

    expect(await html(page).getAttribute("data-first-bg")).toBe(DARK_BG);
    expect(await bodyBackground(page)).toBe(DARK_BG);
  });
});

test.describe("forced colors", () => {
  test.use({ forcedColors: "active", colorScheme: "light" });

  test("the pressed button differs from the unpressed one by more than hue", async ({ page }) => {
    await saveTheme(page, "light");
    await page.goto("/");
    await waitForHydration(page);

    function look(button: ReturnType<typeof lightButton>) {
      return button.evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          background: style.backgroundColor,
          checkOpacity: getComputedStyle(node, "::before").opacity,
        };
      });
    }
    const pressed = await look(lightButton(page));
    const unpressed = await look(darkButton(page));

    // The check mark shows on the pressed button only, in every mode.
    expect(pressed.checkOpacity).toBe("1");
    expect(unpressed.checkOpacity).toBe("0");
    // And the system colours set the pressed button apart.
    expect(pressed.background).not.toBe(unpressed.background);
  });
});

test.describe("when the save fails", () => {
  test.use({ colorScheme: "light" });

  for (const failure of ["the connection drops", "the server answers 500"] as const) {
    test(`${failure}: the screen goes back to the saved theme, with no page error`, async ({
      context,
      page,
    }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.route("http://localhost:*/", async (route) => {
        if (route.request().method() !== "POST") {
          await route.continue();
          return;
        }
        if (failure === "the connection drops") {
          await route.abort("internetdisconnected");
        } else {
          await route.fulfill({ status: 500, body: "Internal Server Error" });
        }
      });
      await page.goto("/");
      await waitForHydration(page);

      const answered = Promise.race([
        page.waitForEvent("requestfinished"),
        page.waitForEvent("requestfailed"),
      ]).catch(() => undefined);
      await darkButton(page).click();
      await answered;

      // Nothing was saved, so the OS theme shows again.
      await expect(darkButton(page)).toHaveAttribute("aria-pressed", "false");
      await expect(html(page)).not.toHaveAttribute("data-theme", /.*/);
      expect(await contextThemeCookie(context)).toBeUndefined();
      await expect(page.getByRole("status")).toHaveText(SAVE_FAILED);
      expect(pageErrors).toEqual([]);
    });
  }

  for (const saved of [null, "dark"] as const) {
    test(`a save cut off after its headers: the screen follows the cookie (saved: ${saved ?? "none"})`, async ({
      context,
      page,
    }) => {
      if (saved) {
        await context.addCookies([{ name: "theme", value: saved, url: "http://localhost" }]);
      }
      // The server saves and its headers (with Set-Cookie) arrive, then the
      // connection breaks partway through the body.
      await page.route("http://localhost:*/", async (route) => {
        if (route.request().method() !== "POST") {
          await route.continue();
          return;
        }
        const response = await route.fetch();
        const body = await response.body();
        await route.fulfill({ response, body: body.subarray(0, 20) });
      });
      await page.goto("/");
      await waitForHydration(page);

      const post = page.waitForEvent("requestfinished");
      await darkButton(page).click();
      await post;

      // Pressing Dark flips the cookie, whatever the response did.
      const expected = saved ? undefined : "dark";
      await expect.poll(() => contextThemeCookie(context)).toBe(expected);
      if (expected) {
        await expect(html(page)).toHaveAttribute("data-theme", expected);
      } else {
        await expect(html(page)).not.toHaveAttribute("data-theme", /.*/);
      }
      await expect(darkButton(page)).toHaveAttribute("aria-pressed", expected ? "true" : "false");
      // The save landed, so there is nothing to apologise for.
      await expect(page.getByRole("status")).toHaveText("");
    });
  }
});

test.describe("quick double press", () => {
  test.use({ colorScheme: "light" });

  test("Dark twice in a row ends with no cookie and no data-theme", async ({ page }) => {
    await page.goto("/");
    await waitForHydration(page);

    let posts = 0;
    page.on("response", (r) => {
      if (r.request().method() === "POST") posts += 1;
    });
    await darkButton(page).click();
    await darkButton(page).click();
    await expect.poll(() => posts).toBe(2);

    await expect.poll(() => themeCookie(page)).toBeUndefined();
    await expect(html(page)).not.toHaveAttribute("data-theme", /.*/);
    await expect(darkButton(page)).toHaveAttribute("aria-pressed", "false");
    await expect(lightButton(page)).toHaveAttribute("aria-pressed", "false");
  });
});

test.describe("no hydration warning", () => {
  test.use({ colorScheme: "light" });

  for (const state of ["no cookie", "light", "dark"] as const) {
    test(`on load with ${state}`, async ({ page }) => {
      const messages: string[] = [];
      page.on("console", (message) => messages.push(message.text()));
      page.on("pageerror", (error) => messages.push(error.message));

      if (state !== "no cookie") {
        await saveTheme(page, state);
      }
      await page.goto("/");
      await waitForHydration(page);

      expect(messages.filter((text) => /hydrat/i.test(text))).toEqual([]);
    });
  }
});

test.describe("skip link", () => {
  test("the first Tab shows 'Skip to content', and Enter moves focus to #main", async ({
    page,
  }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");

    const skipLink = page.getByRole("link", { name: "Skip to content" });
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeInViewport({ ratio: 1 });

    await page.keyboard.press("Enter");
    const main = page.getByRole("main");
    await expect(main).toBeFocused();
    const ring = await main.evaluate((el) => {
      const style = getComputedStyle(el);
      return { width: style.outlineWidth, style: style.outlineStyle };
    });
    expect(ring).toEqual({ width: "3px", style: "solid" });
  });
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("sets --dur-base to 0.01ms and keeps --dur-fade at 150ms", async ({ page }) => {
    await page.goto("/");
    // The built CSS is minified, so "0.01ms" may read back as ".01ms" and
    // "150ms" as ".15s". Compare the values in milliseconds.
    const durations = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      function toMs(value: string) {
        const text = value.trim();
        return text.endsWith("ms") ? parseFloat(text) : parseFloat(text) * 1000;
      }
      return {
        base: toMs(style.getPropertyValue("--dur-base")),
        fade: toMs(style.getPropertyValue("--dur-fade")),
      };
    });
    expect(durations.base).toBeCloseTo(0.01, 5);
    expect(durations.fade).toBeCloseTo(150, 5);
  });
});

test.describe("accessibility", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`axe finds no violations in ${theme}`, async ({ page }) => {
      await saveTheme(page, theme);
      await page.goto("/");
      await expect(html(page)).toHaveAttribute("data-theme", theme);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  }
});

test.describe("footer", () => {
  test("shows the disclaimer word for word", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("contentinfo")).toContainText(DISCLAIMER);
  });
});
