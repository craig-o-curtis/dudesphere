"use client";

import Link from "next/link";
import { Suspense, useActionState, useId } from "react";

import { CookieNote } from "@/components/CookieNote/CookieNote";
import { NextPathField } from "@/components/NextPathField/NextPathField";
import { useFocusFirstInvalid } from "@/hooks/useFocusFirstInvalid";
import { signIn } from "@/lib/actions/auth";
import { initialAuthFormState } from "@/lib/actions/auth-state";

import styles from "./SignInForm.module.css";

// Limits copied from SignInDto (apps/api/src/auth/auth.dto.ts): `identifier`
// is trimmed, then at most 100 code points, and the password has no length
// rule on sign-in, so a password set under an older rule still works. They
// are native attributes so the browser stops a bad value before it posts.
// That matters with JavaScript off, where an error answer is a blank page.
const IDENTIFIER_MAX_LENGTH = 100;
// Asks for a dot in the domain, which Nest's @IsEmail() also asks for.
const EMAIL_PATTERN = "[^@\\s]+@[^@\\s]+\\.[^@\\s.]{2,}";

export function SignInForm() {
  const [state, formAction, pending] = useActionState(signIn, initialAuthFormState);
  const id = useId();
  const formRef = useFocusFirstInvalid(state);
  const identifierErrorId = `${id}-identifier-error`;
  const passwordErrorId = `${id}-password-error`;
  const identifierErrors = state.fieldErrors.identifier ?? [];
  const passwordErrors = state.fieldErrors.password ?? [];

  return (
    <div className={styles.wrap}>
      <form ref={formRef} action={formAction} className={styles.form}>
        {state.formError ? (
          <p role="alert" className={styles.formError}>
            {state.formError}
          </p>
        ) : null}

        <div className={styles.field}>
          <label htmlFor={`${id}-identifier`} className={styles.label}>
            Email
          </label>
          <input
            id={`${id}-identifier`}
            name="identifier"
            type="email"
            autoComplete="username"
            required
            maxLength={IDENTIFIER_MAX_LENGTH}
            pattern={EMAIL_PATTERN}
            title="Enter an email like name@example.com."
            defaultValue={state.values.identifier ?? ""}
            aria-invalid={identifierErrors.length > 0 ? true : undefined}
            aria-describedby={identifierErrors.length > 0 ? identifierErrorId : undefined}
            className={styles.input}
          />
          {identifierErrors.length > 0 ? (
            <p id={identifierErrorId} className={styles.error}>
              {identifierErrors.join(" ")}
            </p>
          ) : null}
        </div>

        <div className={styles.field}>
          <label htmlFor={`${id}-password`} className={styles.label}>
            Password
          </label>
          <input
            id={`${id}-password`}
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={passwordErrors.length > 0 ? true : undefined}
            aria-describedby={passwordErrors.length > 0 ? passwordErrorId : undefined}
            className={styles.input}
          />
          {passwordErrors.length > 0 ? (
            <p id={passwordErrorId} className={styles.error}>
              {passwordErrors.join(" ")}
            </p>
          ) : null}
        </div>

        <Suspense fallback={null}>
          <NextPathField />
        </Suspense>

        {/* Not disabled while pending: a disabled button drops focus. A click is ignored instead. */}
        <button
          type="submit"
          className={styles.button}
          aria-disabled={pending ? true : undefined}
          onClick={(event) => {
            if (pending) event.preventDefault();
          }}
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className={styles.alt}>
        New here? <Link href="/signup">Sign up</Link>
      </p>
      <CookieNote />
    </div>
  );
}
