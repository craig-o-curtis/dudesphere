"use client";

import { useActionState } from "react";

import { AuthForm } from "@/components/AuthForm/AuthForm";
import { carryNextPath } from "@/components/AuthForm/carryNextPath";
import { NextPathSlot } from "@/components/AuthForm/NextPathSlot";
import { CookieNote } from "@/components/CookieNote/CookieNote";
import { EmailField } from "@/components/ui/EmailField/EmailField";
import { InlineLink } from "@/components/ui/InlineLink/InlineLink";
import { PasswordField } from "@/components/ui/PasswordField/PasswordField";
import { signIn } from "@/lib/actions/auth";
import { initialAuthFormState, type AuthField } from "@/lib/actions/auth-state";
import { EMAIL_PATTERN, EMAIL_TITLE, IDENTIFIER_MAX_LENGTH } from "@/lib/auth-rules";

export function SignInForm() {
  const [state, formAction, pending] = useActionState(signIn, initialAuthFormState);

  return (
    <AuthForm
      action={formAction}
      fieldErrors={state.fieldErrors}
      formError={state.formError}
      pending={pending}
      onSubmit={carryNextPath}
      footer={<CookieNote />}
      submitLabel="Sign in"
      pendingLabel="Signing in…"
      alt={
        <>
          New here?{" "}
          <InlineLink href="/signup" tone="accent">
            Sign up
          </InlineLink>
        </>
      }
    >
      <EmailField
        name={"identifier" satisfies AuthField}
        label="Email"
        autoComplete="username"
        required
        maxLength={IDENTIFIER_MAX_LENGTH}
        pattern={EMAIL_PATTERN}
        title={EMAIL_TITLE}
        defaultValue={state.values.identifier ?? ""}
      />
      <PasswordField
        name={"password" satisfies AuthField}
        label="Password"
        autoComplete="current-password"
        required
      />
      <InlineLink href="/forgot-password" tone="accent">
        Forgot password?
      </InlineLink>
      <NextPathSlot />
    </AuthForm>
  );
}
