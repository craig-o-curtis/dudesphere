"use server";

import { cookies } from "next/headers";

import { isTheme, type Theme, THEME_COOKIE } from "@/lib/theme";

// One year, in seconds. A bare number until gmt can express durations.
const ONE_YEAR_IN_SECONDS = 31_536_000;

/**
 * Saves or clears the theme a member picks in the footer toggle, and returns
 * the theme that is saved after the call, or `null` when the OS decides.
 *
 * The toggle sends what the member meant, and this does exactly that. It never
 * reads the cookie to decide what a press means:
 *
 * - `light` or `dark` sets the cookie to that theme for a year and returns it.
 *   It does this even when the cookie already holds that theme, so a repeat
 *   press starts the year over.
 * - `system` deletes the cookie, so the OS decides again, and returns `null`.
 *   Deleting a cookie that isn't there does no harm.
 * - Any other input is ignored and nothing is written. The call returns the
 *   theme already saved: the cookie's value when it is exactly `light` or
 *   `dark`, otherwise `null`. This is the only time the cookie is read.
 *
 * The parameter is `unknown` on purpose. A Server Action is a public POST
 * endpoint, and a fetch-style call can send any value React can decode: an
 * object, `FormData`, a number or nothing at all. The checks are strict
 * comparisons, so no input can throw.
 *
 * Next runs a client's Server Actions one at a time, so quick repeated presses
 * reach this function in order and the cookie ends on the last one.
 *
 * The cookie holds no secret, and the inline `<head>` script must read it, so
 * it is not httpOnly. No session check: the theme is not tied to a member.
 */
export async function setTheme(intent: unknown): Promise<Theme | null> {
  const cookieStore = await cookies();

  if (isTheme(intent)) {
    cookieStore.set(THEME_COOKIE, intent, {
      maxAge: ONE_YEAR_IN_SECONDS,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      httpOnly: false,
    });
    return intent;
  }

  if (intent === "system") {
    cookieStore.delete({ name: THEME_COOKIE, path: "/" });
    return null;
  }

  const saved = cookieStore.get(THEME_COOKIE)?.value;
  return isTheme(saved) ? saved : null;
}
