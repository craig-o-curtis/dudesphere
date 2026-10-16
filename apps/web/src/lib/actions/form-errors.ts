import "server-only";
import { type ApiFieldName, ApiRequestError } from "@/lib/api";

import { AUTH_MESSAGES } from "./auth-state";

// What the auth Server Actions share: reading a form value, and turning a
// failed Nest call into the copy a form shows. The actions in auth.ts and
// password.ts import it.
//
// It is server-only but not 'use server'. A 'use server' file may export only
// async functions, and these are plain ones. Nothing here may log: the form
// data holds passwords and reset tokens.

const SECONDS_PER_MINUTE = 60;

// The path Nest puts before each message about the sign-up profile.
const PROFILE_PREFIX = "profile.";

/** Messages under the form's inputs, and one message for the whole form. */
export interface ValidationErrors<F extends ApiFieldName> {
  fieldErrors: Partial<Record<F, string[]>>;
  formError: string | null;
}

/**
 * One form value as a string. A file, a missing key or anything that isn't
 * FormData counts as "". For a repeated key, FormData.get gives the first.
 * A Server Action is a public POST endpoint, so `formData` can be anything.
 */
export function textField(formData: unknown, name: string): string {
  if (!(formData instanceof FormData)) return "";
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * The error as an ApiRequestError, for a form to map. Anything else, such as
 * API_URL being unset, is a bug in the app, so it is thrown again rather than
 * shown as "try again".
 */
export function apiErrorOrThrow(error: unknown): ApiRequestError {
  if (!(error instanceof ApiRequestError)) throw error;
  return error;
}

/**
 * The form message for an answer no form handles on its own: the wait on a
 * 429, and "unavailable" for a 5xx, no answer (status 0) or any status the
 * form doesn't expect.
 */
export function sharedFormError(error: ApiRequestError): string {
  return error.status === 429 ? tooManyMessage(error.retryAfterSeconds) : AUTH_MESSAGES.unavailable;
}

/**
 * "Easy, man. Try again in N minutes.", with N = Retry-After in minutes,
 * rounded up and never below 1. With no Retry-After, "in a few minutes".
 */
export function tooManyMessage(retryAfterSeconds: number | null): string {
  if (retryAfterSeconds === null) {
    return "Easy, man. Try again in a few minutes.";
  }
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / SECONDS_PER_MINUTE));
  return `Easy, man. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}

/**
 * Sorts a 400's messages for one form. Nest's own words are kept as written,
 * but for a leading "profile.": the display name sits under `profile` in
 * Nest's DTO, and members never see that.
 *
 * Messages for the inputs in `fields` go under them. All the rest fold into
 * one form error, so a message can't vanish under an input that isn't on the
 * page: each one ends with a full stop, and they are joined with a space, in
 * Nest's order. A 400 with no messages at all is "unavailable".
 */
export function validationErrors<F extends ApiFieldName>(
  error: ApiRequestError,
  fields: readonly F[],
): ValidationErrors<F> {
  const fieldErrors: Partial<Record<F, string[]>> = {};
  const loose = [...error.formErrors];

  for (const [field, messages] of Object.entries(error.fieldErrors) as [ApiFieldName, string[]][]) {
    if (isFormField(field, fields)) {
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

function isFormField<F extends ApiFieldName>(
  field: ApiFieldName,
  fields: readonly F[],
): field is F {
  return (fields as readonly ApiFieldName[]).includes(field);
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
