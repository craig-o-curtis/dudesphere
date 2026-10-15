"use server";

import type { TokenPair, UserResponse } from "@dudesphere/api-types";
import { redirect } from "next/navigation";

import { apiFetch, ApiRequestError } from "@/lib/api";
import { safeNextPath } from "@/lib/next-path";
import { logFailure } from "@/lib/route-responses";
import { readSessionCookies, startSession } from "@/lib/session";

import {
  AUTH_MESSAGES,
  type AuthField,
  type AuthFieldErrors,
  type AuthFormState,
  type AuthFormValues,
} from "./auth-state";

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
// status (logFailure).

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

const SECONDS_PER_MINUTE = 60;

// The path Nest puts before each message about the sign-up profile.
const PROFILE_PREFIX = "profile.";

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

// Ends the sign-in already in this browser's cookies, if there is one, so
// the new cookies don't hide a sign-in that Sign out could then never reach
// (QA-2). It runs only once the new pair is in hand, so a failed attempt
// never signs the member out of the sign-in they have.
//
// Only the access token can do this: the refresh cookie is sent to
// /api/auth paths only, so a Server Action never sees it. Nest ends the
// token's sign-in and its whole refresh family. Any answer from Nest that
// isn't a success, or none at all, is logged and the new sign-in goes on:
// a 401 means there was nothing left to end. A plain Error, such as API_URL
// unset, is a bug in the app and is thrown again.
async function endOldSignIn(label: string): Promise<void> {
  const { accessToken } = await readSessionCookies();
  if (!accessToken) return;

  try {
    await apiFetch<void>("/auth/sign-out", { method: "POST", token: accessToken });
  } catch (error) {
    if (!(error instanceof ApiRequestError)) throw error;
    logFailure(label, error);
  }
}

// One form value as a string. A file, a missing key or anything that isn't
// FormData counts as "". For a repeated key, FormData.get gives the first.
function textField(formData: unknown, name: string): string {
  if (!(formData instanceof FormData)) return "";
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
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
  error: unknown,
  fields: readonly AuthField[],
  values: AuthFormValues,
  next: string,
): AuthFormState {
  if (!(error instanceof ApiRequestError)) throw error;

  const state = stateFor(values, next);

  switch (error.status) {
    case 400:
      return { ...state, ...validationErrors(error, fields) };
    case 401:
      return { ...state, formError: AUTH_MESSAGES.badCredentials };
    case 409:
      return { ...state, ...takenErrors(error.errorCode) };
    case 429:
      return { ...state, formError: tooManyMessage(error.retryAfterSeconds) };
    default:
      // A 5xx, no answer (status 0), or any status this form doesn't expect.
      return { ...state, formError: AUTH_MESSAGES.unavailable };
  }
}

// Nest's own words, kept as written but for a leading "profile.": the
// display name sits under `profile` in Nest's DTO, and members never see that.
// Messages for inputs on this form go under them. All the rest fold into one
// form error: each message ends with a full stop, and they are joined with a
// space, in Nest's order.
function validationErrors(
  error: ApiRequestError,
  fields: readonly AuthField[],
): Pick<AuthFormState, "fieldErrors" | "formError"> {
  const fieldErrors: AuthFieldErrors = {};
  const loose = [...error.formErrors];

  for (const [field, messages] of Object.entries(error.fieldErrors) as [AuthField, string[]][]) {
    if (fields.includes(field)) {
      fieldErrors[field] = messages.map(withoutProfilePrefix);
    } else {
      loose.push(...messages);
    }
  }

  if (Object.keys(fieldErrors).length === 0 && loose.length === 0) {
    return { fieldErrors, formError: AUTH_MESSAGES.unavailable };
  }

  return {
    fieldErrors,
    formError:
      loose.length === 0
        ? null
        : loose.map((message) => asSentence(withoutProfilePrefix(message))).join(" "),
  };
}

// "profile.displayName must be ..." becomes "displayName must be ...". Only
// the start is touched, so the rest stays in Nest's words.
function withoutProfilePrefix(message: string): string {
  return message.startsWith(PROFILE_PREFIX) ? message.slice(PROFILE_PREFIX.length) : message;
}

function asSentence(message: string): string {
  const trimmed = message.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
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

// "Easy, man. Try again in N minutes.", with N = Retry-After in minutes,
// rounded up and never below 1.
function tooManyMessage(retryAfterSeconds: number | null): string {
  if (retryAfterSeconds === null) {
    return "Easy, man. Try again in a few minutes.";
  }
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / SECONDS_PER_MINUTE));
  return `Easy, man. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}
