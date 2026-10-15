import { InlineLink } from "@/components/ui/InlineLink/InlineLink";

import styles from "./SiteHeader.module.css";

/**
 * The site header: the wordmark, linked to the home page.
 * Static scaffolding until WORLD-48. It reads no cookies or request data, so the
 * root layout stays in the static shell.
 * FEED-12 adds `<WhoIsSignedIn />` in the inner row, after the wordmark.
 */
export function SiteHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <InlineLink href="/" className={styles.wordmark}>
          Dudesphere
        </InlineLink>
        {/* FEED-12: <WhoIsSignedIn /> goes here. */}
      </div>
    </header>
  );
}
