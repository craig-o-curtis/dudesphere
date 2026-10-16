// The state the forgot-password and reset-password forms keep through
// `useActionState`.
//
// It lives apart from `password.ts` for the same reasons `auth-state.ts`
// lives apart from `auth.ts`. A 'use server' file may only export async
// functions, so it can't export the initial states. And the client forms
// import from here, so this file must hold no server code: no `server-only`,
// no `next/headers`, no `lib/api`.
//
// Form field names (the `name` of each input):
//
// - /forgot-password: `email`, the "Email" input.
// - /reset-password: `token`, a hidden input that holds the token from the
//   link; `password`, the "New password" input; and `confirmPassword`, the
//   "Same again" input. Only `token` and `password` go to Nest:
//   ResetPasswordDto refuses any other field.
//
// The copy for a 429 ("Easy, man. Try again in N minutes.") and for Nest
// being down (AUTH_MESSAGES.unavailable in `auth-state.ts`) is the same as on
// /login and /signup.

/** The input an error can sit under on /forgot-password. */
export type ForgotPasswordField = "email";

export interface ForgotPasswordFormState {
  /** Nest's 400 messages under "Email". */
  fieldErrors: Partial<Record<ForgotPasswordField, string[]>>;
  /** One message for the whole form, shown in `role="alert"`, or null. */
  formError: string | null;
  /** What the member typed, so the form can refill "Email" through `defaultValue`. */
  values: Partial<Record<ForgotPasswordField, string>>;
}

/** The state before the first submit. Pass it to `useActionState`. */
export const initialForgotPasswordFormState: ForgotPasswordFormState = {
  fieldErrors: {},
  formError: null,
  values: {},
};

/** The inputs an error can sit under on /reset-password: "New password" and "Same again". */
export type ResetPasswordField = "password" | "confirmPassword";

/**
 * The reset form's state. It never holds the token or either password, so
 * there are no `values`: the browser keeps what was typed in the inputs.
 */
export interface ResetPasswordFormState {
  /**
   * Messages under their inputs. Nest's password messages go under
   * `password`. PASSWORD_MESSAGES.mismatch goes under `confirmPassword`.
   */
  fieldErrors: Partial<Record<ResetPasswordField, string[]>>;
  /**
   * One message for the whole form, shown in `role="alert"`, or null. When
   * `linkInvalid` is true it is PASSWORD_MESSAGES.linkInvalid.
   */
  formError: string | null;
  /**
   * True when Nest says the link is spent, expired or malformed: a 400 with
   * `RESET_TOKEN_INVALID`, or a 400 whose messages are about `token`. The
   * form then shows what a URL with no token shows: "That link no longer
   * works." with a link to /forgot-password, and no password inputs, since
   * a new password can't help.
   */
  linkInvalid: boolean;
}

/** The state before the first submit. Pass it to `useActionState`. */
export const initialResetPasswordFormState: ResetPasswordFormState = {
  fieldErrors: {},
  formError: null,
  linkInvalid: false,
};

/** Copy the password actions return. The forms may import it for their tests. */
export const PASSWORD_MESSAGES = {
  linkInvalid: "That link no longer works.",
  mismatch: "The two passwords don't match.",
} as const;
