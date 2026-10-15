import type { Metadata } from "next";

import { SignUpForm } from "@/components/SignUpForm/SignUpForm";

import styles from "./page.module.css";

export const metadata: Metadata = { title: "Sign up" };

// Synchronous and static. The form is a client component, and its request time
// reads (`?next=`) sit behind <Suspense> inside it, so the static shell holds
// the heading, the lead and the whole form.
export default function SignUpPage() {
  return (
    <section className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>Sign up</h1>
        <p className={styles.lead}>Make an account. It takes a minute.</p>
      </header>
      <SignUpForm />
    </section>
  );
}
