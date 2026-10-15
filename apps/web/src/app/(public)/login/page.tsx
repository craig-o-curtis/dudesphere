import type { Metadata } from "next";

import { SignInForm } from "@/components/SignInForm/SignInForm";
import { Heading } from "@/components/ui/Heading/Heading";
import { PageShell } from "@/components/ui/PageShell/PageShell";

export const metadata: Metadata = { title: "Sign in" };

// Synchronous and static. The form is a client component, and its one request
// time read (`?next=`) sits behind a <Suspense> inside it, so the static shell
// holds the heading and the whole form.
export default function LoginPage() {
  return (
    <PageShell.Root width="form" gap="l">
      <Heading level={1} size="3xl">
        Sign in
      </Heading>
      <SignInForm />
    </PageShell.Root>
  );
}
