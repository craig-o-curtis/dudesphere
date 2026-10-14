/**
 * The theme a member has chosen. With no `theme` cookie, the OS decides
 * through `prefers-color-scheme`, and `<html>` carries no `data-theme`.
 */
export type Theme = "light" | "dark";

/** The cookie that holds a chosen theme. It is not httpOnly: `themeInitScript` reads it. */
export const THEME_COOKIE = "theme";

/** True only for the exact strings `light` and `dark`. */
export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

/**
 * Reads the chosen theme from a cookie string, such as `document.cookie`, by
 * the same rule as `themeInitScript` and Next's `cookies().get("theme")`.
 * Returns `light` or `dark`, or `null` when no valid theme is saved. It never
 * throws: a value that fails to decode is skipped.
 *
 * It is a separate copy of the script's rule because the script must stay a
 * fixed string. `theme.spec.ts` runs one table through the script, this
 * function and Next's parser, so the three can't drift apart.
 */
export function themeFromCookieHeader(header: string): Theme | null {
  let value: string | null = null;

  for (const pair of header.split(/; */)) {
    if (!pair) continue;

    const splitAt = pair.indexOf("=");
    if (splitAt === -1) {
      if (pair === THEME_COOKIE) value = "true";
      continue;
    }
    if (pair.slice(0, splitAt) !== THEME_COOKIE) continue;

    try {
      value = decodeURIComponent(pair.slice(splitAt + 1));
    } catch {
      // Next skips a pair that fails to decode, so this does too.
    }
  }

  return isTheme(value) ? value : null;
}

/**
 * The inline `<head>` script that sets `data-theme` on `<html>` before the
 * first paint, so a chosen theme never flashes.
 *
 * It reads the cookie by the same rule as Next's `cookies().get("theme")`, so
 * the first paint and the server-rendered toggle always agree. Next 16.4
 * (`RequestCookies` in `next/dist/compiled/@edge-runtime/cookies`) splits the
 * header at each `;` and any spaces after it, skips empty pairs, reads a pair with no `=` as the value
 * `true`, splits a pair on its first `=`, and percent-decodes the value. A pair
 * that fails to decode is skipped. When a name repeats, the last pair that
 * decodes wins. The script does the same, with the decode in its own
 * `try/catch` so a malformed value is skipped and never throws.
 *
 * It has no function wrapper (the coding standards rule out IIFEs). It is one
 * `try` block that declares everything with `let` and `const`, which are
 * scoped to the block even in a classic script, so nothing leaks to `window`.
 * It must never use `var`, which would leak a global. `theme.spec.ts` checks
 * both.
 *
 * It is a fixed string with nothing interpolated. It compares the decoded
 * value with the literals `light` and `dark`, and only ever writes one of
 * those. Any other value, markup and quotes included, is ignored and never
 * reaches the DOM. The cookie name `theme` must match `THEME_COOKIE`, and
 * `theme.spec.ts` checks it, along with a table that runs each cookie header
 * through this script, `themeFromCookieHeader` and Next's parser.
 */
export const themeInitScript =
  'try{let t=null;for(const s of document.cookie.split(/; */)){if(!s)continue;const j=s.indexOf("=");if(j===-1){if(s==="theme")t="true";continue}if(s.slice(0,j)!=="theme")continue;try{t=decodeURIComponent(s.slice(j+1))}catch(e){}}if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}';
