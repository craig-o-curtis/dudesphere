"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useActionState, useId } from "react";

import { CookieNote } from "@/components/CookieNote/CookieNote";
import { NextPathField } from "@/components/NextPathField/NextPathField";
import { useFocusFirstInvalid } from "@/hooks/useFocusFirstInvalid";
import { signUp } from "@/lib/actions/auth";
import { initialAuthFormState } from "@/lib/actions/auth-state";

import styles from "./SignUpForm.module.css";

// Limits copied from CreateUserDto (apps/api/src/users/dto/create-user.dto.ts)
// and CreateProfileDto (apps/api/src/profiles/dto/create-profile-dto.ts). They
// are native attributes so the browser stops a bad value before it posts. That
// matters with JavaScript off, where an error answer is a blank page. Nest
// counts code points (@MaxCodePoints) and `maxlength` counts UTF-16 units, so
// an emoji may stop the browser a little early. Nest stays the judge.
const EMAIL_MAX_LENGTH = 100; // create-user.dto.ts:36
const DISPLAY_NAME_MIN_LENGTH = 2; // create-profile-dto.ts:29
const DISPLAY_NAME_MAX_LENGTH = 50; // create-profile-dto.ts:30
const USERNAME_MIN_LENGTH = 3; // create-user.dto.ts:20
const USERNAME_MAX_LENGTH = 24; // create-user.dto.ts:24
const USERNAME_PATTERN = "[^\\s@]+"; // create-user.dto.ts:30
const PASSWORD_MIN_LENGTH = 12; // create-user.dto.ts:44
const PASSWORD_MAX_LENGTH = 128; // create-user.dto.ts:48
// `minlength` counts UTF-16 units, so six emoji pass it. `pattern` is compiled
// with the v flag, so "." counts code points like Nest does. The email pattern
// asks for a dot in the domain, which @IsEmail() also asks for. A padded
// display name and zero-width characters are left to Nest.
const EMAIL_PATTERN = "[^@\\s]+@[^@\\s]+\\.[^@\\s.]{2,}";
// At least two characters that are not spaces, so "   " and " a " are refused.
const DISPLAY_NAME_PATTERN = ".*\\S.*\\S.*";
const PASSWORD_PATTERN = ".{12,128}";

function loginHref(next: string | null) {
  return next && next !== "/" ? `/login?next=${encodeURIComponent(next)}` : "/login";
}

// Reads `?next=` so the link keeps it. useSearchParams() is a request-time
// read, so the form puts this inside <Suspense> with a plain link as fallback.
function SignInLinkWithNext() {
  const next = useSearchParams().get("next");
  return <Link href={loginHref(next)}>Sign in</Link>;
}

export function SignUpForm() {
  const [state, formAction, pending] = useActionState(signUp, initialAuthFormState);
  const id = useId();
  const formRef = useFocusFirstInvalid(state);

  function describedBy(field: "email" | "displayName" | "username" | "password", hint: boolean) {
    const ids = [];
    if (hint) ids.push(`${id}-${field}-hint`);
    if ((state.fieldErrors[field] ?? []).length > 0) ids.push(`${id}-${field}-error`);
    return ids.length > 0 ? ids.join(" ") : undefined;
  }

  function invalid(field: "email" | "displayName" | "username" | "password") {
    return (state.fieldErrors[field] ?? []).length > 0 ? true : undefined;
  }

  function errorFor(field: "email" | "displayName" | "username" | "password") {
    const errors = state.fieldErrors[field] ?? [];
    return errors.length > 0 ? (
      <p id={`${id}-${field}-error`} className={styles.error}>
        {errors.join(" ")}
      </p>
    ) : null;
  }

  return (
    <div className={styles.wrap}>
      <form ref={formRef} action={formAction} className={styles.form}>
        {state.formError ? (
          <p role="alert" className={styles.formError}>
            {state.formError}
            {state.accountReady ? (
              <>
                {" "}
                <Link href={loginHref(state.next)}>Sign in</Link>
              </>
            ) : null}
          </p>
        ) : null}

        <div className={styles.field}>
          <label htmlFor={`${id}-email`} className={styles.label}>
            Email
          </label>
          <input
            id={`${id}-email`}
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={EMAIL_MAX_LENGTH}
            pattern={EMAIL_PATTERN}
            title="Enter an email like name@example.com."
            defaultValue={state.values.email ?? ""}
            aria-invalid={invalid("email")}
            aria-describedby={describedBy("email", false)}
            className={styles.input}
          />
          {errorFor("email")}
        </div>

        <div className={styles.field}>
          <label htmlFor={`${id}-displayName`} className={styles.label}>
            Display name
          </label>
          <input
            id={`${id}-displayName`}
            name="displayName"
            type="text"
            // oxlint-disable-next-line jsx-a11y/autocomplete-valid -- "nickname" is a valid HTML autofill token (WCAG 1.3.5); oxlint's list lacks it
            autoComplete="nickname"
            required
            minLength={DISPLAY_NAME_MIN_LENGTH}
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            pattern={DISPLAY_NAME_PATTERN}
            title="Use at least 2 characters that are not spaces."
            defaultValue={state.values.displayName ?? ""}
            aria-invalid={invalid("displayName")}
            aria-describedby={describedBy("displayName", true)}
            className={styles.input}
          />
          <p id={`${id}-displayName-hint`} className={styles.hint}>
            The name other members see.
          </p>
          {errorFor("displayName")}
        </div>

        <div className={styles.field}>
          <label htmlFor={`${id}-username`} className={styles.label}>
            Username
          </label>
          <input
            id={`${id}-username`}
            name="username"
            type="text"
            autoComplete="off"
            required
            minLength={USERNAME_MIN_LENGTH}
            maxLength={USERNAME_MAX_LENGTH}
            pattern={USERNAME_PATTERN}
            title="No @ or spaces."
            defaultValue={state.values.username ?? ""}
            aria-invalid={invalid("username")}
            aria-describedby={describedBy("username", true)}
            className={styles.input}
          />
          <p id={`${id}-username-hint`} className={styles.hint}>
            Used to sign in. It isn&apos;t shown on your profile. No @ or spaces.
          </p>
          {errorFor("username")}
        </div>

        <div className={styles.field}>
          <label htmlFor={`${id}-password`} className={styles.label}>
            Password
          </label>
          <input
            id={`${id}-password`}
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            maxLength={PASSWORD_MAX_LENGTH}
            pattern={PASSWORD_PATTERN}
            title="12 to 128 characters."
            aria-invalid={invalid("password")}
            aria-describedby={describedBy("password", true)}
            className={styles.input}
          />
          <p id={`${id}-password-hint`} className={styles.hint}>
            12 to 128 characters.
          </p>
          {errorFor("password")}
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
          {pending ? "Signing up…" : "Sign up"}
        </button>
      </form>

      <p className={styles.alt}>
        Already a member?{" "}
        <Suspense fallback={<Link href="/login">Sign in</Link>}>
          <SignInLinkWithNext />
        </Suspense>
      </p>
      <CookieNote />
    </div>
  );
}
