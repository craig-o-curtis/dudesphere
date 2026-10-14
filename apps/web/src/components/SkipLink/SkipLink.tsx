import styles from "./SkipLink.module.css";

/** The first focusable element on every page. It stays off-screen until it has focus. */
export function SkipLink() {
  return (
    <a className={styles.skipLink} href="#main">
      Skip to content
    </a>
  );
}
