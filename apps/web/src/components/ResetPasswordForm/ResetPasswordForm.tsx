"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { AuthForm } from "@/components/AuthForm/AuthForm";
import { NEW_PASSWORD_TITLE, NewPasswordField } from "@/components/AuthForm/NewPasswordField";
import { FormAlert } from "@/components/ui/FormAlert/FormAlert";
import { InlineLink } from "@/components/ui/InlineLink/InlineLink";
import { Stack } from "@/components/ui/Stack/Stack";
import { Text } from "@/components/ui/Text/Text";
import { resetPassword } from "@/lib/actions/password";
import {
  initialResetPasswordFormState,
  PASSWORD_MESSAGES,
  type ResetPasswordField,
} from "@/lib/actions/password-state";

const PAGE_PATH = "/reset-password";

/**
 * What a link with no token, or a spent one, shows: the message and the way to
 * ask again. `moveFocus` is true after a submit, when the form that held focus
 * has just gone, so focus lands here and not on the page body. It is false on
 * load, so the page keeps its normal focus order.
 */
function LinkInvalid({ moveFocus }: { moveFocus: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (moveFocus) ref.current?.focus();
  }, [moveFocus]);

  return (
    <Stack ref={ref} tabIndex={-1}>
      <FormAlert>{PASSWORD_MESSAGES.linkInvalid}</FormAlert>
      <Text>
        <InlineLink href="/forgot-password" tone="accent">
          Ask for a new link
        </InlineLink>
      </Text>
    </Stack>
  );
}

/**
 * `token` comes from the page's `?token=`. A missing or empty one shows the
 * invalid state and no form. Once the form is on screen the token leaves the
 * address bar, so it isn't kept in history or sent in a Referer header.
 */
export function ResetPasswordForm({ token }: { token: string | null }) {
  const [state, formAction, pending] = useActionState(resetPassword, initialResetPasswordFormState);
  // Kept in state so a re-render that no longer has the query can't drop it.
  const [kept] = useState(token);

  useEffect(() => {
    if (kept) {
      // Pass no state. Next's patched replaceState ignores any state that has
      // `__NA`, and then its router keeps the old URL, so the Server Action
      // would still post to `?token=...`. With no state, Next copies its own
      // fields across and updates its URL to the path.
      window.history.replaceState(null, "", PAGE_PATH);
    }
  }, [kept]);

  if (!kept || state.linkInvalid) {
    return <LinkInvalid moveFocus={state.linkInvalid} />;
  }

  return (
    <AuthForm
      action={formAction}
      fieldErrors={state.fieldErrors}
      formError={state.formError}
      pending={pending}
      submitLabel="Change password"
      pendingLabel="Changing…"
      alt={
        <>
          Changed your mind?{" "}
          <InlineLink href="/login" tone="accent">
            Sign in
          </InlineLink>
        </>
      }
    >
      <NewPasswordField
        name={"password" satisfies ResetPasswordField}
        label="New password"
        hint={NEW_PASSWORD_TITLE}
      />
      <NewPasswordField name={"confirmPassword" satisfies ResetPasswordField} label="Same again" />
      <input type="hidden" name="token" value={kept} />
    </AuthForm>
  );
}
