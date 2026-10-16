import type { Metadata } from "next";
import { Suspense } from "react";

import {
  ResetPasswordFromLink,
  type ResetPasswordParams,
} from "@/components/ResetPasswordForm/ResetPasswordFromLink";
import { Heading } from "@/components/ui/Heading/Heading";
import { PageShell } from "@/components/ui/PageShell/PageShell";
import { Text } from "@/components/ui/Text/Text";

import styles from "./page.module.css";

export const metadata: Metadata = { title: "Reset password" };

// Synchronous. The heading is in the static shell. Only the part that reads
// `?token=` waits behind <Suspense>.
export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<ResetPasswordParams>;
}) {
  return (
    <PageShell.Root width="form" gap="l">
      <Heading level={1} size="3xl">
        Reset password
      </Heading>
      <Suspense
        fallback={
          // Streamed holes need a script to show. With JavaScript off the
          // fallback is all a visitor sees, so say what is missing.
          // The grid item is the wrapper, so the class goes on it.
          <div className={styles.noscript}>
            <noscript>
              <Text>Turn on JavaScript to set a new password.</Text>
            </noscript>
          </div>
        }
      >
        <ResetPasswordFromLink searchParams={searchParams} />
      </Suspense>
    </PageShell.Root>
  );
}
