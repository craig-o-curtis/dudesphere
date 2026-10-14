import { RequestCookies } from "next/dist/server/web/spec-extension/cookies";

import { isTheme, THEME_COOKIE, themeFromCookieHeader, themeInitScript } from "./theme";

// Runs the script the way the browser runs the inline <head> script: as plain
// source text in the page's global scope, not as an imported function.
function runInitScript() {
  // oxlint-disable-next-line typescript/no-implied-eval -- the point is to run the exact string the layout inlines
  new Function(themeInitScript)();
}

function setCookie(value: string) {
  document.cookie = value;
}

// Makes document.cookie return a fixed string, for cases jsdom can't store,
// such as two cookies with the same name.
function stubCookieString(value: string) {
  vi.spyOn(document, "cookie", "get").mockReturnValue(value);
}

// The theme the server sees: the same `cookies().get("theme")` read that
// ThemeSetting and setTheme make, kept only when it is light or dark.
function serverTheme(cookieHeader: string) {
  const value = new RequestCookies(new Headers({ cookie: cookieHeader })).get(THEME_COOKIE)?.value;
  return isTheme(value) ? value : null;
}

function clearCookies() {
  for (const pair of document.cookie.split("; ")) {
    const name = pair.split("=")[0];
    if (name) document.cookie = `${name}=; max-age=0; path=/`;
  }
}

describe("THEME_COOKIE", () => {
  it("is named theme", () => {
    expect(THEME_COOKIE).toBe("theme");
  });
});

describe("isTheme", () => {
  it.each(["light", "dark"])("accepts %s", (value) => {
    expect(isTheme(value)).toBe(true);
  });

  it.each(["system", "", "Light", "DARK", " dark", '"><script>', null, undefined, 1, {}])(
    "rejects %j",
    (value) => {
      expect(isTheme(value)).toBe(false);
    },
  );
});

describe("themeInitScript", () => {
  const html = document.documentElement;

  beforeEach(() => {
    clearCookies();
    html.removeAttribute("data-theme");
  });

  afterEach(() => {
    // Restore first: one test makes the cookie getter throw.
    vi.restoreAllMocks();
    clearCookies();
    html.removeAttribute("data-theme");
  });

  it("is a static string with no template placeholders", () => {
    expect(typeof themeInitScript).toBe("string");
    expect(themeInitScript).not.toContain("${");
    expect(themeInitScript).not.toMatch(/<\/script/i);
  });

  it("reads the cookie named by THEME_COOKIE", () => {
    expect(themeInitScript).toContain(`"${THEME_COOKIE}"`);
  });

  it("sets data-theme to light when the cookie is light", () => {
    setCookie("theme=light; path=/");
    runInitScript();
    expect(html.getAttribute("data-theme")).toBe("light");
  });

  it("sets data-theme to dark when the cookie is dark", () => {
    setCookie("theme=dark; path=/");
    runInitScript();
    expect(html.getAttribute("data-theme")).toBe("dark");
  });

  it("finds the theme cookie among other cookies", () => {
    setCookie("first=1; path=/");
    setCookie("theme=dark; path=/");
    setCookie("last=2; path=/");
    runInitScript();
    expect(html.getAttribute("data-theme")).toBe("dark");
  });

  it("leaves data-theme unset when there is no cookie", () => {
    runInitScript();
    expect(html.hasAttribute("data-theme")).toBe(false);
  });

  it("ignores a cookie whose name only ends in theme", () => {
    setCookie("xtheme=dark; path=/");
    runInitScript();
    expect(html.hasAttribute("data-theme")).toBe(false);
  });

  it('ignores a hand-set cookie holding markup such as "><script>', () => {
    setCookie('theme="><script>; path=/');
    // Proves the junk value really reached document.cookie, so the script saw it.
    expect(document.cookie).toContain('theme="><script>');
    runInitScript();
    expect(html.hasAttribute("data-theme")).toBe(false);
  });

  it.each(["system", "Dark", "dark%22", "light dark", "%6Cigh"])(
    "ignores the unknown value %s",
    (value) => {
      setCookie(`theme=${value}; path=/`);
      runInitScript();
      expect(html.hasAttribute("data-theme")).toBe(false);
    },
  );

  it("decodes the value the way the server does, so %64ark is dark", () => {
    setCookie("theme=%64ark; path=/");
    runInitScript();
    expect(html.getAttribute("data-theme")).toBe("dark");
  });

  it("decodes %6Cight to light", () => {
    setCookie("theme=%6Cight; path=/");
    runInitScript();
    expect(html.getAttribute("data-theme")).toBe("light");
  });

  it("takes the last of two theme cookies, as the server does", () => {
    stubCookieString("theme=light; theme=dark");
    runInitScript();
    expect(html.getAttribute("data-theme")).toBe("dark");
  });

  it("ignores a malformed percent-encoding without throwing", () => {
    setCookie("theme=%E0%A4%A; path=/");
    expect(document.cookie).toContain("theme=%E0%A4%A");
    expect(runInitScript).not.toThrow();
    expect(html.hasAttribute("data-theme")).toBe(false);
  });

  it("skips a malformed theme cookie and keeps the one before it, as the server does", () => {
    stubCookieString("theme=dark; theme=%E0%A4%A");
    runInitScript();
    expect(html.getAttribute("data-theme")).toBe("dark");
  });

  it("does not throw when reading the cookie throws", () => {
    vi.spyOn(document, "cookie", "get").mockImplementation(() => {
      throw new Error("cookies blocked");
    });
    expect(runInitScript).not.toThrow();
    expect(html.hasAttribute("data-theme")).toBe(false);
  });
});

describe("themeFromCookieHeader", () => {
  it.each([
    ["theme=light", "light"],
    ["theme=dark", "dark"],
    ["a=1; theme=dark; b=2", "dark"],
    ["theme=%64ark", "dark"],
    ["theme=light; theme=dark", "dark"],
    ["theme=dark; theme=%E0%A4%A", "dark"],
  ])("reads %j as %s", (cookieHeader, expected) => {
    expect(themeFromCookieHeader(cookieHeader)).toBe(expected);
  });

  it.each(["", "theme=blue", "theme", "theme=dark; theme", "xtheme=dark", "theme=%E0%A4%A"])(
    "reads %j as null",
    (cookieHeader) => {
      expect(themeFromCookieHeader(cookieHeader)).toBeNull();
    },
  );

  it("does not throw on a malformed percent-encoding", () => {
    expect(() => themeFromCookieHeader("theme=%E0%A4%A; theme=%")).not.toThrow();
  });
});

// QA-4 and QA-16: the first paint, the toggle's read-back after a failed save,
// and the toggle the server renders must all pick the same theme. For each
// cookie header, the inline script, themeFromCookieHeader and Next's own cookie
// parser must agree. If a Next upgrade changes how it parses cookies, or the
// script and the function drift apart, this table goes red.
describe("themeInitScript, themeFromCookieHeader and cookies().get agree", () => {
  const html = document.documentElement;

  afterEach(() => {
    vi.restoreAllMocks();
    html.removeAttribute("data-theme");
  });

  it.each([
    "",
    "theme=light",
    "theme=dark",
    "a=1; theme=dark; b=2",
    "theme=%64ark",
    "theme=%6Cight",
    "theme=light; theme=dark",
    "theme=dark; theme=light",
    "theme=dark; theme=blue",
    "theme=%E0%A4%A",
    "theme=dark; theme=%E0%A4%A",
    "theme=%E0%A4%A; theme=light",
    "theme=dark; theme",
    "theme",
    "theme=dark;theme=light",
    "theme=dark;  theme=light",
    "theme=dark=1",
    "theme=dark%3B",
    'theme="dark"',
    "theme=%22%3E%3Cscript%3E",
    "xtheme=dark",
    "Theme=dark",
    "theme =dark",
    "theme= dark",
    "theme=light; theme=%",
    "; theme=dark;",
  ])("all three pick the same theme for %j", (cookieHeader) => {
    const server = serverTheme(cookieHeader);

    stubCookieString(cookieHeader);
    runInitScript();

    expect(html.getAttribute("data-theme")).toBe(server);
    expect(themeFromCookieHeader(cookieHeader)).toBe(server);
  });
});
