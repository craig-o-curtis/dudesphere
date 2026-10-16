"use server";

import { redirect } from "next/navigation";

import { apiFetch, type ApiRequestError } from "@/lib/api";
import { clearSessionCookies, endOldSignIn } from "@/lib/session";

import { apiErrorOrThrow, sharedFormError, textField, validationErrors } from "./form-errors";
import {
  type ForgotPasswordFormState,
  PASSWORD_MESSAGES,
  type ResetPasswordFormState,
} from "./password-state";

// Forgot and reset password, for the forms on /forgot-password and
// /reset-password through `useActionState`. Neither needs a session. Both
// redirect on success, so success works with JavaScript off (a 303). On
// failure each returns the form's state.
//
// A Server Action is a public POST endpoint, so a caller can send any value
// in place of FormData. Next checks Origin against Host before the action
// runs. The form data holds a reset token and a password, so neither is ever
// logged or put in the returned state. The only log line is endOldSignIn's
// failed sign-out, by method, path and status.

const FORGOT_FIELDS = ["email"] as const;
const RESET_FIELDS = ["password"] as const;

// ValidationPipe starts each message with the property's name, such as
// "token should not be empty".
const TOKEN_MESSAGE_PREFIX = "token ";

/**
 * Asks Nest to email a reset link to the address from the /forgot-password
 * form, then redirects to /forgot-password/sent. Nest answers 202 whether or
 * not the address has an account, so the redirect never tells either way.
 * The previous state is ignored.
 */
export async function requestReset(
  _previous: ForgotPasswordFormState,
  formData: FormData,
): Promise<ForgotPasswordFormState> {
  const email = textField(formData, "email");
  const state: ForgotPasswordFormState = { fieldErrors: {}, formError: null, values: { email } };

  try {
    await apiFetch<void>("/auth/password/forgot", { method: "POST", body: { email } });
  } catch (caught) {
    const error = apiErrorOrThrow(caught);
    return error.status === 400
      ? { ...state, ...validationErrors(error, FORGOT_FIELDS) }
      : { ...state, formError: sharedFormError(error) };
  }

  // Outside the try: redirect() throws to do its work.
  redirect("/forgot-password/sent");
}

/**
 * Sets a new password from the /reset-password form. The token comes from
 * the form's hidden `token` input, never from the URL. When "New password"
 * and "Same again" differ, it says so and makes no call to Nest.
 *
 * Nest ends every sign-in of the member on success. This then ends the
 * sign-in in this browser's cookies, whoever's it is, clears the cookies,
 * and redirects to /login?reset=1.
 */
export async function resetPassword(
  _previous: ResetPasswordFormState,
  formData: FormData,
): Promise<ResetPasswordFormState> {
  const token = textField(formData, "token");
  const password = textField(formData, "password");
  const confirmPassword = textField(formData, "confirmPassword");
  const state: ResetPasswordFormState = { fieldErrors: {}, formError: null, linkInvalid: false };

  if (password !== confirmPassword) {
    return { ...state, fieldErrors: { confirmPassword: [PASSWORD_MESSAGES.mismatch] } };
  }

  try {
    // Only these two: ResetPasswordDto refuses any other field.
    await apiFetch<void>("/auth/password/reset", { method: "POST", body: { token, password } });
  } catch (caught) {
    const error = apiErrorOrThrow(caught);
    if (isLinkInvalid(error)) {
      return { ...state, formError: PASSWORD_MESSAGES.linkInvalid, linkInvalid: true };
    }
    return error.status === 400
      ? { ...state, ...validationErrors(error, RESET_FIELDS) }
      : { ...state, formError: sharedFormError(error) };
  }

  // The link may be another member's than the one signed in here. Nest has
  // ended every sign-in of the link's owner. End this browser's own sign-in
  // too, before its cookies go, or Sign out could never reach it (SEC-3).
  // When it was the owner's, it has already ended, sign-out answers 401, and
  // endOldSignIn logs that by method, path and status and goes on.
  await endOldSignIn("Reset password");
  await clearSessionCookies();
  // Outside the try: redirect() throws to do its work.
  redirect("/login?reset=1");
}

// The link can't be used: Nest said RESET_TOKEN_INVALID (spent, expired or
// unknown), or a 400 message is about `token` (empty, not a string, too long).
// A message about the password as well doesn't matter: a new one can't help.
// lib/api has no `token` field, so those messages sit in formErrors.
function isLinkInvalid(error: ApiRequestError): boolean {
  if (error.status !== 400) return false;
  return (
    error.errorCode === "RESET_TOKEN_INVALID" ||
    error.formErrors.some((message) => message.startsWith(TOKEN_MESSAGE_PREFIX))
  );
}
