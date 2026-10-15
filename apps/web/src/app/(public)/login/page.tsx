import type { Metadata } from "next";

import { SignInForm } from "@/components/SignInForm/SignInForm";

import styles from "./page.module.css";

export const metadata: Metadata = { title: "Sign in" };

// Synchronous and static. The form is a client component, and its one request
// time read (`?next=`) sits behind a <Suspense> inside it, so the static shell
// holds the heading and the whole form.
export default function LoginPage() {
  return (
    <section className={styles.main}>
      <h1 className={styles.title}>Sign in</h1>
      <SignInForm />
    </section>
  );
}
