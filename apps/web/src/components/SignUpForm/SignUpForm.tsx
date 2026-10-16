"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useActionState } from "react";

import { AuthForm } from "@/components/AuthForm/AuthForm";
import { carryNextPath } from "@/components/AuthForm/carryNextPath";
import { NEW_PASSWORD_TITLE, NewPasswordField } from "@/components/AuthForm/NewPasswordField";
import { NextPathSlot } from "@/components/AuthForm/NextPathSlot";
import { CookieNote } from "@/components/CookieNote/CookieNote";
import { EmailField } from "@/components/ui/EmailField/EmailField";
import { InlineLink } from "@/components/ui/InlineLink/InlineLink";
import { TextField } from "@/components/ui/TextField/TextField";
import { signUp } from "@/lib/actions/auth";
import { initialAuthFormState, type AuthField } from "@/lib/actions/auth-state";
import {
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  DISPLAY_NAME_PATTERN,
  EMAIL_MAX_LENGTH,
  EMAIL_PATTERN,
  EMAIL_TITLE,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from "@/lib/auth-rules";
import { loginHref } from "@/lib/next-path";

// Reads `?next=` so the link keeps it. useSearchParams() is a request-time
// read, so the form puts this inside <Suspense> with a plain link as fallback.
function SignInLinkWithNext() {
  const next = useSearchParams().get("next");
  return (
    <InlineLink href={loginHref(next)} tone="accent">
      Sign in
    </InlineLink>
  );
}

export function SignUpForm() {
  const [state, formAction, pending] = useActionState(signUp, initialAuthFormState);

  return (
    <AuthForm
      action={formAction}
      fieldErrors={state.fieldErrors}
      formError={
        state.formError ? (
          <>
            {state.formError}
            {state.accountReady ? (
              <>
                {" "}
                <InlineLink href={loginHref(state.next)}>Sign in</InlineLink>
              </>
            ) : null}
          </>
        ) : null
      }
      pending={pending}
      onSubmit={carryNextPath}
      footer={<CookieNote />}
      submitLabel="Sign up"
      pendingLabel="Signing up…"
      alt={
        <>
          Already a member?{" "}
          <Suspense
            fallback={
              <InlineLink href="/login" tone="accent">
                Sign in
              </InlineLink>
            }
          >
            <SignInLinkWithNext />
          </Suspense>
        </>
      }
    >
      <EmailField
        name={"email" satisfies AuthField}
        label="Email"
        autoComplete="email"
        required
        maxLength={EMAIL_MAX_LENGTH}
        pattern={EMAIL_PATTERN}
        title={EMAIL_TITLE}
        defaultValue={state.values.email ?? ""}
      />
      <TextField
        name={"displayName" satisfies AuthField}
        label="Display name"
        hint="The name other members see."
        // oxlint-disable-next-line jsx-a11y/autocomplete-valid -- "nickname" is a valid HTML autofill token (WCAG 1.3.5); oxlint's list lacks it
        autoComplete="nickname"
        required
        minLength={DISPLAY_NAME_MIN_LENGTH}
        maxLength={DISPLAY_NAME_MAX_LENGTH}
        pattern={DISPLAY_NAME_PATTERN}
        title="Use at least 2 characters that are not spaces."
        defaultValue={state.values.displayName ?? ""}
      />
      <TextField
        name={"username" satisfies AuthField}
        label="Username"
        hint="Used to sign in. It isn't shown on your profile. No @ or spaces."
        autoComplete="off"
        required
        minLength={USERNAME_MIN_LENGTH}
        maxLength={USERNAME_MAX_LENGTH}
        pattern={USERNAME_PATTERN}
        title="No @ or spaces."
        defaultValue={state.values.username ?? ""}
      />
      <NewPasswordField
        name={"password" satisfies AuthField}
        label="Password"
        hint={NEW_PASSWORD_TITLE}
      />
      <NextPathSlot />
    </AuthForm>
  );
}
