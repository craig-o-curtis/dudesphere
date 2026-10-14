import { FRAMES_PER_GAME } from "@dudesphere/lane-engine";

import styles from "./page.module.css";

// A placeholder until FEED-12 builds the splash. It has no data and no
// request-time reads, so it is prerendered into the static shell.
export default function Home() {
  return (
    <section className={styles.main}>
      <h1 className={styles.title}>The Dudesphere</h1>
      <p className={styles.tagline}>The Dude abides. The lanes open soon.</p>
      <p className={styles.note}>{FRAMES_PER_GAME} frames, no hurry. Take it easy, man.</p>
    </section>
  );
}
