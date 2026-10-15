import type { Metadata } from "next";
import { Suspense } from "react";

import { FeedWelcome, FeedWelcomeSkeleton } from "@/components/FeedWelcome/FeedWelcome";
import { Heading } from "@/components/ui/Heading/Heading";
import { PageShell } from "@/components/ui/PageShell/PageShell";

export const metadata: Metadata = { title: "Feed" };

// A placeholder. FEED-13 replaces this page body. Keep the shape: a synchronous
// page whose one session read (`requireSession("/feed")`) sits behind <Suspense>,
// so the heading is in the static shell.
export default function FeedPage() {
  return (
    <PageShell.Root>
      <Heading level={1} size="3xl">
        Feed
      </Heading>
      <Suspense fallback={<FeedWelcomeSkeleton />}>
        <FeedWelcome />
      </Suspense>
    </PageShell.Root>
  );
}
