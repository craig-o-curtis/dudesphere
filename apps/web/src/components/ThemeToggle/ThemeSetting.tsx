import { cookies } from "next/headers";

import { isTheme, THEME_COOKIE } from "@/lib/theme";

import { ThemeToggle } from "./ThemeToggle";

/**
 * Reads the saved theme and renders the toggle. Reading `cookies()` makes this
 * dynamic, so the page owner must wrap it in `<Suspense>`, with
 * `<ThemeToggle current={null} pending />` as the fallback.
 */
export async function ThemeSetting() {
  const cookieStore = await cookies();
  const value = cookieStore.get(THEME_COOKIE)?.value;

  return <ThemeToggle current={isTheme(value) ? value : null} />;
}
