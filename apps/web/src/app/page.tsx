import { FRAMES_PER_GAME } from "@dudesphere/lane-engine";
import { Suspense } from "react";

import {
  SessionCorner,
  SessionCornerSkeleton,
  type SignoutParams,
} from "@/components/SessionCorner/SessionCorner";
import { Heading } from "@/components/ui/Heading/Heading";
import { PageShell } from "@/components/ui/PageShell/PageShell";
import { Text } from "@/components/ui/Text/Text";

// A placeholder until FEED-12 builds the splash. The corner reads
// cookies behind Suspense, so the rest is prerendered into the static shell.
export default function Home({ searchParams }: { searchParams: Promise<SignoutParams> }) {
  return (
    <PageShell.Root width="fit" align="center" text="center">
      <Heading level={1} size="3xl">
        Dudesphere
      </Heading>
      <Text size="xl">The Dude abides. The lanes open soon.</Text>
      <Text tone="muted">{FRAMES_PER_GAME} frames, no hurry. Take it easy, man.</Text>
      <Suspense fallback={<SessionCornerSkeleton />}>
        <SessionCorner searchParams={searchParams} />
      </Suspense>
    </PageShell.Root>
  );
}
