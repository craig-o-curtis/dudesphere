// @vitest-environment node
// Server Actions run on the server only, so these tests run in Node.

import type { ApiError } from "@dudesphere/api-types";
import { redirect } from "next/navigation";

import { apiFetch, ApiRequestError } from "@/lib/api";
import { clearSessionCookies, endOldSignIn } from "@/lib/session";

import { AUTH_MESSAGES } from "./auth-state";
import { requestReset, resetPassword } from "./password";
import {
  initialForgotPasswordFormState,
  initialResetPasswordFormState,
  PASSWORD_MESSAGES,
  type ResetPasswordFormState,
} from "./password-state";

// The real package throws when imported outside a React Server Component
// build. Next resolves it to an empty module on the server; this does the same.
vi.mock("server-only", () => ({}));

// The real redirect throws NEXT_REDIRECT and never returns. This throws too,
// so code after it can't run, and a test can see the error isn't swallowed.
class RedirectSignal extends Error {
  constructor(readonly target: string) {
    super(`redirect to ${target}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: vi.fn((target: string) => {
    throw new RedirectSignal(target);
  }),
}));

// Keeps the real ApiRequestError, so its 400 mapping runs as it does in the app.
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

// endOldSignIn's own branches (no cookie, a 401, a failure, a plain Error)
// are tested in lib/session.spec.ts. Here it only resolves or throws.
vi.mock("@/lib/session", () => ({
  clearSessionCookies: vi.fn(async () => {}),
  endOldSignIn: vi.fn(async () => {}),
}));

// Made-up people and tokens. Nothing here comes from .env, a log or a real email.
const EMAIL = "e2e-0a1b2c3d4e5f@example.com";
const TOKEN = "made-up-reset-token-0123456789abcdefghijklmn";
const NEW_PASSWORD = "the-rug-really-tied-the-room-together";

function form(entries: Record<string, string | Blob>): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(entries)) {
    formData.append(name, value);
  }
  return formData;
}

function forgotForm(email = EMAIL): FormData {
  return form({ email });
}

function resetForm(extra: Record<string, string> = {}): FormData {
  return form({
    token: TOKEN,
    password: NEW_PASSWORD,
    confirmPassword: NEW_PASSWORD,
    ...extra,
  });
}

function apiError(
  status: number,
  body: ApiError | null = null,
  retryAfterSeconds: number | null = null,
): ApiRequestError {
  return new ApiRequestError(`test answered ${status}`, { status, body, retryAfterSeconds });
}

function badRequest(messages: string[]): ApiRequestError {
  return apiError(400, { statusCode: 400, message: messages, error: "Bad Request" });
}

// What AuthThrottlerGuard sends.
function tooMany(retryAfterSeconds: number | null): ApiRequestError {
  return apiError(
    429,
    { statusCode: 429, message: "Too many requests", errorCode: "RATE_LIMITED" },
    retryAfterSeconds,
  );
}

// What POST /auth/password/reset sends for a spent, expired or unknown token.
const tokenInvalid = apiError(400, {
  statusCode: 400,
  message: "Invalid or expired link",
  error: "Bad Request",
  errorCode: "RESET_TOKEN_INVALID",
});

async function expectRedirectTo(action: Promise<unknown>, target: string) {
  await expect(action).rejects.toThrow(RedirectSignal);
  expect(redirect).toHaveBeenCalledTimes(1);
  expect(redirect).toHaveBeenCalledWith(target);
}

function expectNoSecrets(state: ResetPasswordFormState) {
  const text = JSON.stringify(state);
  expect(text).not.toContain(TOKEN);
  expect(text).not.toContain(NEW_PASSWORD);
}

afterEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiFetch).mockReset();
  vi.restoreAllMocks();
});

describe("requestReset", () => {
  // apiFetch answers undefined for Nest's 202, whose body is empty.
  it("posts only the email to /auth/password/forgot, then redirects on the 202", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(undefined);

    await expectRedirectTo(
      requestReset(initialForgotPasswordFormState, forgotForm()),
      "/forgot-password/sent",
    );

    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith("/auth/password/forgot", {
      method: "POST",
      body: { email: EMAIL },
    });
  });

  it("puts Nest's 400 messages under Email and keeps what was typed", async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(badRequest(["email must be an email"]));

    const state = await requestReset(initialForgotPasswordFormState, forgotForm("not-an-email"));

    expect(state).toEqual({
      fieldErrors: { email: ["email must be an email"] },
      formError: null,
      values: { email: "not-an-email" },
    });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("shows a 400 message about another field as a form error", async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(badRequest(["property extra should not exist"]));

    const state = await requestReset(initialForgotPasswordFormState, forgotForm());

    expect(state.fieldErrors).toEqual({});
    expect(state.formError).toBe("property extra should not exist.");
  });

  it.each([
    [1, "Easy, man. Try again in 1 minute."],
    [600, "Easy, man. Try again in 10 minutes."],
    [null, "Easy, man. Try again in a few minutes."],
  ])("on a 429 with Retry-After %s, says how long to wait", async (seconds, message) => {
    vi.mocked(apiFetch).mockRejectedValueOnce(tooMany(seconds));

    const state = await requestReset(initialForgotPasswordFormState, forgotForm());

    expect(state).toEqual({ fieldErrors: {}, formError: message, values: { email: EMAIL } });
    expect(redirect).not.toHaveBeenCalled();
  });

  it.each([
    ["Nest is down (no answer)", 0],
    ["a 500", 500],
    ["a 401 it doesn't expect", 401],
    ["an ApiRequestError with a 2xx status, such as a 202 body that isn't JSON", 202],
  ])("on %s, says it's unavailable", async (_label, status) => {
    vi.mocked(apiFetch).mockRejectedValueOnce(apiError(status));

    const state = await requestReset(initialForgotPasswordFormState, forgotForm());

    expect(state.formError).toBe(AUTH_MESSAGES.unavailable);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("throws again an error that isn't an ApiRequestError", async () => {
    const bug = new Error("API_URL is not set.");
    vi.mocked(apiFetch).mockRejectedValueOnce(bug);

    await expect(requestReset(initialForgotPasswordFormState, forgotForm())).rejects.toBe(bug);
  });

  it("treats a value that isn't FormData as an empty email", async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(badRequest(["email should not be empty"]));

    const state = await requestReset(initialForgotPasswordFormState, "nope" as never);

    expect(apiFetch).toHaveBeenCalledWith("/auth/password/forgot", {
      method: "POST",
      body: { email: "" },
    });
    expect(state.fieldErrors).toEqual({ email: ["email should not be empty"] });
  });
});

describe("resetPassword", () => {
  it("posts only the token and the new password, never confirmPassword", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(undefined);

    await expectRedirectTo(
      resetPassword(initialResetPasswordFormState, resetForm()),
      "/login?reset=1",
    );

    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith("/auth/password/reset", {
      method: "POST",
      body: { token: TOKEN, password: NEW_PASSWORD },
    });
  });

  it("on a 204, clears the session cookies before it redirects to /login?reset=1", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(undefined);

    await expectRedirectTo(
      resetPassword(initialResetPasswordFormState, resetForm()),
      "/login?reset=1",
    );

    expect(clearSessionCookies).toHaveBeenCalledTimes(1);
    expect(vi.mocked(clearSessionCookies).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(redirect).mock.invocationCallOrder[0] ?? 0,
    );
  });

  // SEC-3 (AUTH-9 review round 1). The link may belong to another member
  // than the one signed in on this browser. Nest ends the link owner's
  // sign-ins; this ends the browser's own, which the cleared cookies would
  // otherwise leave out of Sign out's reach. When it was the owner's own
  // sign-in, Nest has already ended it, sign-out answers 401, and
  // endOldSignIn logs that and resolves.
  it("on a 204, ends this browser's sign-in, then clears the cookies, then redirects", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(undefined);

    await expectRedirectTo(
      resetPassword(initialResetPasswordFormState, resetForm()),
      "/login?reset=1",
    );

    expect(endOldSignIn).toHaveBeenCalledTimes(1);
    expect(endOldSignIn).toHaveBeenCalledWith("Reset password");
    const [ended] = vi.mocked(endOldSignIn).mock.invocationCallOrder;
    const [cleared] = vi.mocked(clearSessionCookies).mock.invocationCallOrder;
    const [redirected] = vi.mocked(redirect).mock.invocationCallOrder;
    expect(ended).toBeLessThan(cleared ?? 0);
    expect(cleared).toBeLessThan(redirected ?? 0);
  });

  it("ends this browser's sign-in only after Nest takes the new password", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(undefined);

    await expect(resetPassword(initialResetPasswordFormState, resetForm())).rejects.toThrow(
      RedirectSignal,
    );

    const [resetCall] = vi.mocked(apiFetch).mock.invocationCallOrder;
    const [ended] = vi.mocked(endOldSignIn).mock.invocationCallOrder;
    expect(resetCall).toBeLessThan(ended ?? 0);
  });

  it.each([
    ["a mismatch", undefined, { confirmPassword: `${NEW_PASSWORD}!` }],
    ["RESET_TOKEN_INVALID", tokenInvalid, {}],
    ["a password 400", badRequest(["password must be a string"]), {}],
    ["a 429", tooMany(60), {}],
    ["no answer", apiError(0), {}],
  ])("on %s, leaves this browser's sign-in alone", async (_label, failure, extra) => {
    if (failure) vi.mocked(apiFetch).mockRejectedValueOnce(failure);

    await resetPassword(initialResetPasswordFormState, resetForm(extra));

    expect(endOldSignIn).not.toHaveBeenCalled();
    expect(clearSessionCookies).not.toHaveBeenCalled();
  });

  it("lets a plain Error from ending the old sign-in surface, and clears nothing", async () => {
    const bug = new Error("API_URL is not set.");
    vi.mocked(apiFetch).mockResolvedValueOnce(undefined);
    vi.mocked(endOldSignIn).mockRejectedValueOnce(bug);

    await expect(resetPassword(initialResetPasswordFormState, resetForm())).rejects.toBe(bug);

    expect(clearSessionCookies).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("on a mismatch, says so under Same again and makes no call", async () => {
    const state = await resetPassword(
      initialResetPasswordFormState,
      resetForm({ confirmPassword: `${NEW_PASSWORD}!` }),
    );

    expect(state).toEqual({
      fieldErrors: { confirmPassword: [PASSWORD_MESSAGES.mismatch] },
      formError: null,
      linkInvalid: false,
    });
    expect(apiFetch).not.toHaveBeenCalled();
    expect(clearSessionCookies).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
    expectNoSecrets(state);
  });

  it("on RESET_TOKEN_INVALID, returns the invalid-link state", async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(tokenInvalid);

    const state = await resetPassword(initialResetPasswordFormState, resetForm());

    expect(state).toEqual({
      fieldErrors: {},
      formError: PASSWORD_MESSAGES.linkInvalid,
      linkInvalid: true,
    });
    expect(clearSessionCookies).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
    expectNoSecrets(state);
  });

  it("with an empty token, returns the invalid-link state from Nest's token message", async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(badRequest(["token should not be empty"]));

    const state = await resetPassword(initialResetPasswordFormState, resetForm({ token: "" }));

    expect(apiFetch).toHaveBeenCalledWith("/auth/password/reset", {
      method: "POST",
      body: { token: "", password: NEW_PASSWORD },
    });
    expect(state).toEqual({
      fieldErrors: {},
      formError: PASSWORD_MESSAGES.linkInvalid,
      linkInvalid: true,
    });
  });

  it("with a too-long token, returns the invalid-link state, password message or not", async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(
      badRequest([
        "token must be shorter than or equal to 1000 characters",
        "password must be longer than or equal to 12 characters",
      ]),
    );

    const state = await resetPassword(
      initialResetPasswordFormState,
      resetForm({ token: "a".repeat(1001), password: "short", confirmPassword: "short" }),
    );

    expect(state).toEqual({
      fieldErrors: {},
      formError: PASSWORD_MESSAGES.linkInvalid,
      linkInvalid: true,
    });
  });

  it("puts Nest's password messages under New password", async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(
      badRequest(["password must be longer than or equal to 12 characters"]),
    );

    const state = await resetPassword(
      initialResetPasswordFormState,
      resetForm({ password: "eleven-char", confirmPassword: "eleven-char" }),
    );

    expect(state).toEqual({
      fieldErrors: { password: ["password must be longer than or equal to 12 characters"] },
      formError: null,
      linkInvalid: false,
    });
    expect(redirect).not.toHaveBeenCalled();
    expectNoSecrets(state);
  });

  it("shows a 400 message about no known field as a form error, not the invalid link", async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(
      badRequest(["property confirmPassword should not exist"]),
    );

    const state = await resetPassword(initialResetPasswordFormState, resetForm());

    expect(state).toEqual({
      fieldErrors: {},
      formError: "property confirmPassword should not exist.",
      linkInvalid: false,
    });
  });

  it.each([
    [1, "Easy, man. Try again in 1 minute."],
    [61, "Easy, man. Try again in 2 minutes."],
    [null, "Easy, man. Try again in a few minutes."],
  ])("on a 429 with Retry-After %s, says how long to wait", async (seconds, message) => {
    vi.mocked(apiFetch).mockRejectedValueOnce(tooMany(seconds));

    const state = await resetPassword(initialResetPasswordFormState, resetForm());

    expect(state).toEqual({ fieldErrors: {}, formError: message, linkInvalid: false });
    expect(clearSessionCookies).not.toHaveBeenCalled();
  });

  it.each([
    ["Nest is down (no answer)", 0],
    ["a 500", 500],
    ["a 401 it doesn't expect", 401],
  ])("on %s, says it's unavailable", async (_label, status) => {
    vi.mocked(apiFetch).mockRejectedValueOnce(apiError(status));

    const state = await resetPassword(initialResetPasswordFormState, resetForm());

    expect(state).toEqual({
      fieldErrors: {},
      formError: AUTH_MESSAGES.unavailable,
      linkInvalid: false,
    });
    expect(clearSessionCookies).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("throws again an error that isn't an ApiRequestError", async () => {
    const bug = new Error("API_URL is not set.");
    vi.mocked(apiFetch).mockRejectedValueOnce(bug);

    await expect(resetPassword(initialResetPasswordFormState, resetForm())).rejects.toBe(bug);
    expect(clearSessionCookies).not.toHaveBeenCalled();
  });

  it("logs nothing, so the token and password never reach a log", async () => {
    const spies = [
      vi.spyOn(console, "log"),
      vi.spyOn(console, "info"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "error"),
    ];
    vi.mocked(apiFetch)
      .mockRejectedValueOnce(tokenInvalid)
      .mockRejectedValueOnce(apiError(500))
      .mockResolvedValueOnce(undefined);

    await resetPassword(initialResetPasswordFormState, resetForm());
    await resetPassword(initialResetPasswordFormState, resetForm());
    await expect(resetPassword(initialResetPasswordFormState, resetForm())).rejects.toThrow(
      RedirectSignal,
    );

    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
});
