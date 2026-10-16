"use client";

import { useActionState } from "react";

import { AuthForm } from "@/components/AuthForm/AuthForm";
import { EmailField } from "@/components/ui/EmailField/EmailField";
import { InlineLink } from "@/components/ui/InlineLink/InlineLink";
import { requestReset } from "@/lib/actions/password";
import {
  initialForgotPasswordFormState,
  type ForgotPasswordField,
} from "@/lib/actions/password-state";
import { EMAIL_MAX_LENGTH, EMAIL_PATTERN, EMAIL_TITLE } from "@/lib/auth-rules";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestReset, initialForgotPasswordFormState);

  return (
    <AuthForm
      action={formAction}
      fieldErrors={state.fieldErrors}
      formError={state.formError}
      pending={pending}
      submitLabel="Send the link"
      pendingLabel="Sending…"
      alt={
        <>
          Remembered it?{" "}
          <InlineLink href="/login" tone="accent">
            Sign in
          </InlineLink>
        </>
      }
    >
      <EmailField
        name={"email" satisfies ForgotPasswordField}
        label="Email"
        autoComplete="email"
        required
        maxLength={EMAIL_MAX_LENGTH}
        pattern={EMAIL_PATTERN}
        title={EMAIL_TITLE}
        defaultValue={state.values.email ?? ""}
      />
    </AuthForm>
  );
}
