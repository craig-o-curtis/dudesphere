// The state the sign-in and sign-up forms keep through `useActionState`.
//
// It lives apart from `auth.ts` for two reasons. A 'use server' file may only
// export async functions, so it can't export `initialAuthFormState`. And the
// client forms import from here, so this file must hold no server code: no
// `server-only`, no `next/headers`, no `lib/api`.

/** The inputs an error can sit under. `identifier` is the "Email" input on /login. */
export type AuthField = "identifier" | "email" | "displayName" | "username" | "password";

/** Messages under each input, in the order to show them. A missing key means none. */
export type AuthFieldErrors = Partial<Record<AuthField, string[]>>;

/**
 * What the member typed, sent back so the form can refill its inputs through
 * `defaultValue`. It never holds a password: the type has no key for one.
 * Sign-in fills `identifier`. Sign-up fills `email`, `displayName` and `username`.
 */
export type AuthFormValues = Partial<Record<Exclude<AuthField, "password">, string>>;

export interface AuthFormState {
  /** Messages under their inputs. */
  fieldErrors: AuthFieldErrors;
  /** One message for the whole form, shown in `role="alert"`, or null. */
  formError: string | null;
  /** What the member typed, without the password. */
  values: AuthFormValues;
  /**
   * True only when sign-up made the account but the sign-in step after it
   * failed. `formError` then holds "Your account is ready, but we couldn't
   * sign you in just now.", and the form shows a "Sign in" link to /login
   * that carries `next`.
   */
  accountReady: boolean;
  /**
   * Where to go after signing in: the posted `next` when it is a safe
   * same-origin path, otherwise "/". Already checked by safeNextPath.
   */
  next: string;
}

/** The state before the first submit. Pass it to `useActionState`. */
export const initialAuthFormState: AuthFormState = {
  fieldErrors: {},
  formError: null,
  values: {},
  accountReady: false,
  next: "/",
};

/** Error copy the actions return. The forms may import it for their tests. */
export const AUTH_MESSAGES = {
  badCredentials: "That email or password doesn't match.",
  emailTaken: "That email already has an account. Sign in instead.",
  usernameTaken: "That username is taken. Try another.",
  displayNameTaken: "Another member already goes by that name. Try another.",
  valueTaken: "Somebody already took that, man. Try another email, username or display name.",
  accountReady: "Your account is ready, but we couldn't sign you in just now.",
  unavailable: "Something went sideways on our end. Try again in a moment.",
} as const;
