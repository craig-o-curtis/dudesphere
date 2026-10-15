import type { Metadata } from "next";

import { SignUpForm } from "@/components/SignUpForm/SignUpForm";
import { Heading } from "@/components/ui/Heading/Heading";
import { PageShell } from "@/components/ui/PageShell/PageShell";
import { Text } from "@/components/ui/Text/Text";

export const metadata: Metadata = { title: "Sign up" };

// Synchronous and static. The form is a client component, and its request time
// reads (`?next=`) sit behind <Suspense> inside it, so the static shell holds
// the heading, the lead and the whole form.
export default function SignUpPage() {
  return (
    <PageShell.Root width="form" gap="l">
      <PageShell.Header>
        <Heading level={1} size="3xl">
          Sign up
        </Heading>
        <Text>Make an account. It takes a minute.</Text>
      </PageShell.Header>
      <SignUpForm />
    </PageShell.Root>
  );
}
