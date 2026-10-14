import { Suspense } from "react";

import { ThemeSetting } from "@/components/ThemeToggle/ThemeSetting";
import { ThemeToggle } from "@/components/ThemeToggle/ThemeToggle";

import styles from "./SiteFooter.module.css";

/**
 * The site footer: the fan-community disclaimer and the theme toggle.
 * A Server Component. `ThemeSetting` reads `cookies()`, so it sits in
 * Suspense with the null-state toggle as its fallback.
 */
export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <p className={styles.disclaimer}>
          Dudesphere is a fan community inspired by The Big Lebowski. It is not affiliated with the
          film, its makers or Universal, nor with Dudeism and the Church of the Latter-Day Dude.
        </p>
        <div className={styles.theme}>
          <Suspense fallback={<ThemeToggle current={null} pending />}>
            <ThemeSetting />
          </Suspense>
        </div>
      </div>
    </footer>
  );
}
