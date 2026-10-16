"use server";

import type { TokenPair, UserResponse } from "@dudesphere/api-types";
import { redirect } from "next/navigation";

import { apiFetch, ApiRequestError } from "@/lib/api";
import { safeNextPath } from "@/lib/next-path";
import { endOldSignIn, startSession } from "@/lib/session";

import {
  AUTH_MESSAGES,
  type AuthField,
  type AuthFormState,
  type AuthFormValues,
} from "./auth-state";
import { apiErrorOrThrow, sharedFormError, textField, validationErrors } from "./form-errors";

// Password sign-in and sign-up, for the forms on /login and /signup through
// `useActionState`. Each one calls Nest, and on success saves the token pair
// in the cookies through startSession() and redirects. On failure it returns
// the form's state: messages under inputs, one form message, and what the
// member typed, never the password.
//
// A Server Action is a public POST endpoint, so a caller can send any value
// in place of FormData. Next checks Origin against Host before the action
// runs. The form data holds a password and the answers hold tokens, so the
// only log line is a failed sign-out of the old sign-in, by method, path and
// status (endOldSignIn in lib/session.ts).

// The inputs each form has. A 400 message about any other input is shown as
// a form error, so it can't vanish under an input that isn't on the page.
const SIGN_IN_FIELDS: readonly AuthField[] = ["identifier", "password"];
const SIGN_UP_FIELDS: readonly AuthField[] = ["email", "displayName", "username", "password"];

// Nest's 409 codes, and the input each one belongs under.
const TAKEN: ReadonlyMap<string, { field: AuthField; message: string }> = new Map([
  ["EMAIL_TAKEN", { field: "email", message: AUTH_MESSAGES.emailTaken }],
  ["USERNAME_TAKEN", { field: "username", message: AUTH_MESSAGES.usernameTaken }],
  ["DISPLAY_NAME_TAKEN", { field: "displayName", message: AUTH_MESSAGES.displayNameTaken }],
]);

/**
 * Signs a member in with the email (sent to Nest as `identifier`) and
 * password from the /login form. On success it starts the session and
 * redirects to the safe `next`, or "/". The previous state is ignored.
 */
export async function signIn(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const identifier = textField(formData, "identifier");
  const password = textField(formData, "password");
  const next = textField(formData, "next");
  const values: AuthFormValues = { identifier };

  let pair: TokenPair;
  try {
    pair = await apiFetch<TokenPair>("/auth/token", {
      method: "POST",
      body: { identifier, password },
    });
  } catch (error) {
    return failedState(error, SIGN_IN_FIELDS, values, next);
  }

  await endOldSignIn("Sign in");
  // Outside the try: redirect() throws to do its work.
  const target = await startSession(pair, next);
  redirect(target);
}

/**
 * Makes an account from the /signup form, then signs the new member in with
 * the same email and password. On success it starts the session and
 * redirects to the safe `next`, or "/".
 *
 * When the account is made but the sign-in step fails, it returns
 * `accountReady: true`, so the form can offer a link to /login.
 */
export async function signUp(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = textField(formData, "email");
  const displayName = textField(formData, "displayName");
  const username = textField(formData, "username");
  const password = textField(formData, "password");
  const next = textField(formData, "next");
  const values: AuthFormValues = { email, displayName, username };

  try {
    await apiFetch<UserResponse>("/auth/sign-up", {
      method: "POST",
      body: { username, email, password, profile: { displayName } },
    });
  } catch (error) {
    return failedState(error, SIGN_UP_FIELDS, values, next);
  }

  let pair: TokenPair;
  try {
    pair = await apiFetch<TokenPair>("/auth/token", {
      method: "POST",
      body: { identifier: email, password },
    });
  } catch (error) {
    if (!(error instanceof ApiRequestError)) throw error;
    return {
      ...stateFor(values, next),
      formError: AUTH_MESSAGES.accountReady,
      accountReady: true,
    };
  }

  await endOldSignIn("Sign up");
  // Outside the try: redirect() throws to do its work.
  const target = await startSession(pair, next);
  redirect(target);
}

function stateFor(values: AuthFormValues, next: string): AuthFormState {
  return {
    fieldErrors: {},
    formError: null,
    values,
    accountReady: false,
    next: safeNextPath(next),
  };
}

// Turns a failed Nest call into the form's state. Anything that isn't an
// ApiRequestError, such as API_URL being unset, is a bug in the app, so it
// is thrown again rather than shown as "try again".
function failedState(
  caught: unknown,
  fields: readonly AuthField[],
  values: AuthFormValues,
  next: string,
): AuthFormState {
  const error = apiErrorOrThrow(caught);
  const state = stateFor(values, next);

  switch (error.status) {
    case 400:
      return { ...state, ...validationErrors(error, fields) };
    case 401:
      return { ...state, formError: AUTH_MESSAGES.badCredentials };
    case 409:
      return { ...state, ...takenErrors(error.errorCode) };
    default:
      // A 429 says how long to wait. A 5xx, no answer (status 0), or any
      // status this form doesn't expect is "unavailable".
      return { ...state, formError: sharedFormError(error) };
  }
}

// VALUE_TAKEN comes from a race the database caught, where Nest can't say
// which value was taken. It, and any 409 without a known code, is a form error.
function takenErrors(errorCode: string | null): Pick<AuthFormState, "fieldErrors" | "formError"> {
  const taken = errorCode === null ? undefined : TAKEN.get(errorCode);
  if (!taken) {
    return { fieldErrors: {}, formError: AUTH_MESSAGES.valueTaken };
  }
  return { fieldErrors: { [taken.field]: [taken.message] }, formError: null };
}
