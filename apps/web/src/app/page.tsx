import { FRAMES_PER_GAME } from "@dudesphere/lane-engine";
import { Suspense } from "react";

import {
  SessionCorner,
  SessionCornerSkeleton,
  type SignoutParams,
} from "@/components/SessionCorner/SessionCorner";

import styles from "./page.module.css";

// A placeholder until FEED-12 builds the splash. The corner reads
// cookies behind Suspense, so the rest is prerendered into the static shell.
export default function Home({ searchParams }: { searchParams: Promise<SignoutParams> }) {
  return (
    <section className={styles.main}>
      <h1 className={styles.title}>The Dudesphere</h1>
      <p className={styles.tagline}>The Dude abides. The lanes open soon.</p>
      <p className={styles.note}>{FRAMES_PER_GAME} frames, no hurry. Take it easy, man.</p>
      <Suspense fallback={<SessionCornerSkeleton />}>
        <SessionCorner searchParams={searchParams} />
      </Suspense>
    </section>
  );
}
