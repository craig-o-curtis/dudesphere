"use server";

import { cookies } from "next/headers";

import { isTheme, type Theme, THEME_COOKIE } from "@/lib/theme";

// One year, in seconds. A bare number until gmt can express durations.
const ONE_YEAR_IN_SECONDS = 31_536_000;

/**
 * Saves or clears the theme a member picks in the footer toggle, and returns
 * the theme that is saved after the call, or `null` when the OS decides.
 *
 * Each button always sends its own theme, `light` or `dark`, and the server
 * decides what that press means:
 *
 * - If the `theme` cookie already holds that theme, the press is a second
 *   press on the chosen button. The cookie is deleted, so the OS decides
 *   again, and the call returns `null`.
 * - Otherwise the cookie is set to that theme for a year, and the call returns
 *   it.
 * - Any other input is ignored and nothing is written. The call returns the
 *   theme already saved, or `null`.
 *
 * A saved cookie counts only when it holds exactly `light` or `dark`. Any
 * other value counts as no saved theme.
 *
 * The parameter is `unknown` on purpose. A Server Action is a public POST
 * endpoint, and a fetch-style call can send any value React can decode: an
 * object, `FormData`, a number or nothing at all. `isTheme` is a strict
 * comparison, so no input can throw.
 *
 * Next runs a client's Server Actions one at a time, so quick repeated presses
 * reach this function in order and each one sees the cookie the last one left.
 *
 * The cookie holds no secret, and the inline `<head>` script must read it, so
 * it is not httpOnly. No session check: the theme is not tied to a member.
 */
export async function setTheme(theme: unknown): Promise<Theme | null> {
  const cookieStore = await cookies();
  const savedValue = cookieStore.get(THEME_COOKIE)?.value;
  const saved = isTheme(savedValue) ? savedValue : null;

  if (!isTheme(theme)) {
    return saved;
  }

  if (saved === theme) {
    cookieStore.delete({ name: THEME_COOKIE, path: "/" });
    return null;
  }

  cookieStore.set(THEME_COOKIE, theme, {
    maxAge: ONE_YEAR_IN_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: false,
  });
  return theme;
}
