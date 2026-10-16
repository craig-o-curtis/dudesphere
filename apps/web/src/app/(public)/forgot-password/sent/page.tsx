import type { Metadata } from "next";

import { Heading } from "@/components/ui/Heading/Heading";
import { InlineLink } from "@/components/ui/InlineLink/InlineLink";
import { PageShell } from "@/components/ui/PageShell/PageShell";
import { Text } from "@/components/ui/Text/Text";

export const metadata: Metadata = { title: "Check your email" };

// Static. The copy is the same whether or not the address has an account.
export default function ForgotPasswordSentPage() {
  return (
    <PageShell.Root width="form" gap="l">
      <PageShell.Header>
        <Heading level={1} size="3xl">
          Check your email
        </Heading>
        <Text>If that address has an account, we sent it a link.</Text>
      </PageShell.Header>
      <Text>
        <InlineLink href="/login" tone="accent">
          Back to sign in
        </InlineLink>
      </Text>
    </PageShell.Root>
  );
}
