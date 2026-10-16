import type { Metadata } from "next";
import { Suspense } from "react";

import { LoginNotice, type ResetParams } from "@/components/LoginNotice/LoginNotice";
import { SignInForm } from "@/components/SignInForm/SignInForm";
import { Heading } from "@/components/ui/Heading/Heading";
import { PageShell } from "@/components/ui/PageShell/PageShell";

export const metadata: Metadata = { title: "Sign in" };

// Synchronous. The notice reads `?reset=` behind its own <Suspense>. The form
// is a client component, and its one request time read (`?next=`) sits behind
// a <Suspense> inside it, so the static shell holds the heading and the whole
// form.
export default function LoginPage({ searchParams }: { searchParams: Promise<ResetParams> }) {
  return (
    <PageShell.Root width="form" gap="l">
      <Heading level={1} size="3xl">
        Sign in
      </Heading>
      <Suspense fallback={null}>
        <LoginNotice searchParams={searchParams} />
      </Suspense>
      <SignInForm />
    </PageShell.Root>
  );
}
