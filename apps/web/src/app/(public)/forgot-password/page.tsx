import type { Metadata } from "next";

import { ForgotPasswordForm } from "@/components/ForgotPasswordForm/ForgotPasswordForm";
import { Heading } from "@/components/ui/Heading/Heading";
import { PageShell } from "@/components/ui/PageShell/PageShell";
import { Text } from "@/components/ui/Text/Text";

export const metadata: Metadata = { title: "Forgot password" };

// Synchronous and static. The form is a client component with no request time reads.
export default function ForgotPasswordPage() {
  return (
    <PageShell.Root width="form" gap="l">
      <PageShell.Header>
        <Heading level={1} size="3xl">
          Forgot password
        </Heading>
        <Text>Enter your email and we&apos;ll send a link to choose a new one.</Text>
      </PageShell.Header>
      <ForgotPasswordForm />
    </PageShell.Root>
  );
}
