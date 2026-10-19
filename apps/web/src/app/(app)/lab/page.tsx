import type { Metadata } from "next";
import { Suspense } from "react";

import { LabIndex, LabIndexSkeleton } from "@/components/LabIndex/LabIndex";
import { Heading } from "@/components/ui/Heading/Heading";
import { PageShell } from "@/components/ui/PageShell/PageShell";
import { Text } from "@/components/ui/Text/Text";

export const metadata: Metadata = { title: "Rendering lab", robots: { index: false } };

// Synchronous: the heading and intro are in the static shell, which goes to every visitor. The
// rows sit in one hole that checks the role first, so they never reach a non-admin.
export default function LabPage() {
  return (
    <PageShell.Root>
      <Heading level={1} size="3xl">
        Rendering lab
      </Heading>
      <Text tone="muted">
        Every rendering strategy this app teaches, and the routes that use it.
      </Text>
      <Suspense fallback={<LabIndexSkeleton />}>
        <LabIndex />
      </Suspense>
    </PageShell.Root>
  );
}
