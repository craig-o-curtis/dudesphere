// @vitest-environment node
// Server Actions run on the server only, so these tests run in Node.

import type { ApiError, TokenPair } from "@dudesphere/api-types";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { apiFetch, ApiRequestError } from "@/lib/api";
import { REFRESH_COOKIE, SESSION_COOKIE } from "@/lib/session";

import { signIn, signUp } from "./auth";
import { AUTH_MESSAGES, type AuthFormState, initialAuthFormState } from "./auth-state";

// The real package throws when imported outside a React Server Component
// build. Next resolves it to an empty module on the server; this does the same.
vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

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

const cookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};

// Made-up people and tokens. Nothing here comes from .env or a real sign-in.
const EMAIL = "e2e-0a1b2c3d4e5f@example.com";
const USERNAME = "e2e-0a1b2c3d4e5f";
const DISPLAY_NAME = "The Dude";
const PASSWORD = "correct-horse-battery-staple";

const pair: TokenPair = {
  accessToken: "access-token-for-tests",
  refreshToken: "refresh-token-for-tests",
  expiresIn: 900,
};

const createdUser = { id: 1, username: USERNAME, email: EMAIL };

function form(entries: Record<string, string | Blob | (string | Blob)[]>): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(entries)) {
    for (const entry of Array.isArray(value) ? value : [value]) {
      formData.append(name, entry);
    }
  }
  return formData;
}

function signInForm(extra: Record<string, string> = {}): FormData {
  return form({ identifier: EMAIL, password: PASSWORD, ...extra });
}

function signUpForm(extra: Record<string, string> = {}): FormData {
  return form({
    email: EMAIL,
    displayName: DISPLAY_NAME,
    username: USERNAME,
    password: PASSWORD,
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

function conflict(errorCode: string | undefined, message = "Already taken"): ApiRequestError {
  return apiError(409, { statusCode: 409, message, error: "Conflict", errorCode });
}

function tooMany(retryAfterSeconds: number | null): ApiRequestError {
  return apiError(
    429,
    { statusCode: 429, message: "Too many requests", errorCode: "TOO_MANY_ATTEMPTS" },
    retryAfterSeconds,
  );
}

const badCredentials = apiError(401, {
  statusCode: 401,
  message: "Invalid credentials",
  error: "Unauthorized",
  errorCode: "BAD_CREDENTIALS",
});

// Answers each apiFetch call in turn: a value resolves, an Error rejects.
function apiAnswers(...answers: unknown[]) {
  const mocked = vi.mocked(apiFetch);
  for (const answer of answers) {
    if (answer instanceof Error) {
      mocked.mockRejectedValueOnce(answer);
    } else {
      mocked.mockResolvedValueOnce(answer);
    }
  }
}

async function expectRedirectTo(action: Promise<unknown>, target: string) {
  await expect(action).rejects.toThrow(RedirectSignal);
  expect(redirect).toHaveBeenCalledTimes(1);
  expect(redirect).toHaveBeenCalledWith(target);
}

function expectNoCookies() {
  expect(cookieStore.set).not.toHaveBeenCalled();
  expect(cookieStore.delete).not.toHaveBeenCalled();
  expect(redirect).not.toHaveBeenCalled();
}

function expectNoPassword(state: AuthFormState) {
  expect(JSON.stringify(state)).not.toContain(PASSWORD);
  expect(state.values).not.toHaveProperty("password");
}

beforeEach(() => {
  vi.mocked(cookies).mockResolvedValue(
    cookieStore as unknown as Awaited<ReturnType<typeof cookies>>,
  );
});

afterEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiFetch).mockReset();
  vi.restoreAllMocks();
});

describe("signIn", () => {
  it("posts the email as identifier with the password to POST /auth/token", async () => {
    apiAnswers(pair);

    await expect(signIn(initialAuthFormState, signInForm())).rejects.toThrow(RedirectSignal);

    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith("/auth/token", {
      method: "POST",
      body: { identifier: EMAIL, password: PASSWORD },
    });
  });

  it("starts the session with both cookies before it redirects", async () => {
    apiAnswers(pair);

    await expectRedirectTo(signIn(initialAuthFormState, signInForm()), "/");

    expect(cookieStore.set).toHaveBeenCalledWith(
      SESSION_COOKIE,
      pair.accessToken,
      expect.objectContaining({ httpOnly: true, path: "/" }),
    );
    expect(cookieStore.set).toHaveBeenCalledWith(
      REFRESH_COOKIE,
      pair.refreshToken,
      expect.objectContaining({ httpOnly: true, path: "/api/auth" }),
    );
  });

  it.each(["/?welcome=1", "/dudes/1?x=1#y"])("redirects to a safe next, %s", async (next) => {
    apiAnswers(pair);

    await expectRedirectTo(signIn(initialAuthFormState, signInForm({ next })), next);
  });

  it.each([
    ["another origin", "//evil.example.com"],
    ["a full URL", "https://evil.example.com"],
    ["a backslash", "/\\evil.example.com"],
    ["a script URL", "javascript:alert(1)"],
    ["an API path", "/api/auth/logout"],
    ["an empty value", ""],
  ])("redirects to / for %s", async (_label, next) => {
    apiAnswers(pair);

    await expectRedirectTo(signIn(initialAuthFormState, signInForm({ next })), "/");
  });

  it("redirects to / when there is no next", async () => {
    apiAnswers(pair);

    await expectRedirectTo(
      signIn(initialAuthFormState, form({ identifier: EMAIL, password: PASSWORD })),
      "/",
    );
  });

  it("gives the one 401 message, keeps the email and drops the password", async () => {
    apiAnswers(badCredentials);

    const state = await signIn(initialAuthFormState, signInForm({ next: "/?welcome=1" }));

    expect(state).toEqual({
      fieldErrors: {},
      formError: AUTH_MESSAGES.badCredentials,
      values: { identifier: EMAIL },
      accountReady: false,
      next: "/?welcome=1",
    });
    expectNoPassword(state);
    expectNoCookies();
  });

  it("gives the same 401 message whatever Nest's code or body", async () => {
    apiAnswers(apiError(401, null));

    const state = await signIn(initialAuthFormState, signInForm());

    expect(state.formError).toBe(AUTH_MESSAGES.badCredentials);
  });

  it.each([
    ["60 seconds", 60, "Easy, man. Try again in 1 minute."],
    ["61 seconds", 61, "Easy, man. Try again in 2 minutes."],
    ["1 second", 1, "Easy, man. Try again in 1 minute."],
    ["0 seconds", 0, "Easy, man. Try again in 1 minute."],
    ["900 seconds", 900, "Easy, man. Try again in 15 minutes."],
    ["no Retry-After", null, "Easy, man. Try again in a few minutes."],
  ])("gives the 429 wait for %s", async (_label, seconds, message) => {
    apiAnswers(tooMany(seconds));

    const state = await signIn(initialAuthFormState, signInForm());

    expect(state.formError).toBe(message);
    expect(state.fieldErrors).toEqual({});
    expectNoPassword(state);
    expectNoCookies();
  });

  it("puts 400 messages under their inputs, identifier under Email", async () => {
    apiAnswers(
      badRequest([
        "identifier should not be empty",
        "password should not be empty",
        "password must be a string",
      ]),
    );

    const state = await signIn(initialAuthFormState, signInForm());

    expect(state.fieldErrors).toEqual({
      identifier: ["identifier should not be empty"],
      password: ["password should not be empty", "password must be a string"],
    });
    expect(state.formError).toBeNull();
    expect(state.values).toEqual({ identifier: EMAIL });
    expectNoPassword(state);
  });

  it("folds 400 messages that belong to no input into one form error", async () => {
    apiAnswers(
      badRequest([
        "property extra should not exist",
        "identifier should not be empty",
        "property other should not exist",
      ]),
    );

    const state = await signIn(initialAuthFormState, signInForm());

    expect(state.fieldErrors).toEqual({ identifier: ["identifier should not be empty"] });
    expect(state.formError).toBe(
      "property extra should not exist. property other should not exist.",
    );
  });

  it("shows a 400 message about an input the form doesn't have as a form error", async () => {
    apiAnswers(badRequest(["email must be an email", "password should not be empty"]));

    const state = await signIn(initialAuthFormState, signInForm());

    expect(state.fieldErrors).toEqual({ password: ["password should not be empty"] });
    expect(state.formError).toBe("email must be an email.");
  });

  it("gives the 400 message as the form error when Nest sends one string", async () => {
    apiAnswers(apiError(400, { statusCode: 400, message: "Bad Request" }));

    const state = await signIn(initialAuthFormState, signInForm());

    expect(state.fieldErrors).toEqual({});
    expect(state.formError).toBe("Bad Request.");
  });

  it("gives the generic message for a 400 with no usable body", async () => {
    apiAnswers(apiError(400, null));

    const state = await signIn(initialAuthFormState, signInForm());

    expect(state.formError).toBe(AUTH_MESSAGES.unavailable);
  });

  it.each([
    ["no answer", 0],
    ["a 500", 500],
    ["a 502", 502],
    ["a 503", 503],
    ["a 408 from Nest's timeout", 408],
    ["a 403", 403],
    ["a 404", 404],
  ])("gives the generic message for %s", async (_label, status) => {
    apiAnswers(apiError(status));

    const state = await signIn(initialAuthFormState, signInForm());

    expect(state).toEqual({
      fieldErrors: {},
      formError: AUTH_MESSAGES.unavailable,
      values: { identifier: EMAIL },
      accountReady: false,
      next: "/",
    });
    expectNoCookies();
  });

  it("lets a plain Error, such as API_URL unset, surface", async () => {
    const bug = new Error("API_URL is not set.");
    apiAnswers(bug);

    await expect(signIn(initialAuthFormState, signInForm())).rejects.toBe(bug);
    expectNoCookies();
  });

  it("ignores the previous state", async () => {
    apiAnswers(badCredentials);
    const previous: AuthFormState = {
      fieldErrors: { identifier: ["old"] },
      formError: "old",
      values: { identifier: "old@example.com" },
      accountReady: true,
      next: "/old",
    };

    const state = await signIn(previous, signInForm());

    expect(state).toEqual({
      fieldErrors: {},
      formError: AUTH_MESSAGES.badCredentials,
      values: { identifier: EMAIL },
      accountReady: false,
      next: "/",
    });
  });

  it("logs nothing", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    apiAnswers(badCredentials, apiError(500), pair);

    await signIn(initialAuthFormState, signInForm());
    await signIn(initialAuthFormState, signInForm());
    await expect(signIn(initialAuthFormState, signInForm())).rejects.toThrow(RedirectSignal);

    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
});

describe("signIn with hostile FormData", () => {
  it("counts files as empty strings", async () => {
    apiAnswers(badCredentials);
    const formData = form({
      identifier: new Blob([EMAIL]),
      password: new File([PASSWORD], "password.txt"),
      next: new Blob(["/dudes"]),
    });

    const state = await signIn(initialAuthFormState, formData);

    expect(apiFetch).toHaveBeenCalledWith("/auth/token", {
      method: "POST",
      body: { identifier: "", password: "" },
    });
    expect(state.values).toEqual({ identifier: "" });
    expect(state.next).toBe("/");
  });

  it("counts missing keys as empty strings", async () => {
    apiAnswers(badRequest(["identifier should not be empty", "password should not be empty"]));

    const state = await signIn(initialAuthFormState, new FormData());

    expect(apiFetch).toHaveBeenCalledWith("/auth/token", {
      method: "POST",
      body: { identifier: "", password: "" },
    });
    expect(state.values).toEqual({ identifier: "" });
  });

  it("takes only the first of repeated keys", async () => {
    apiAnswers(pair);
    const formData = form({
      identifier: [EMAIL, "e2e-ffffffffffff@example.com"],
      password: [PASSWORD, "another-password-entirely"],
      next: ["/dudes/1", "//evil.example.com"],
    });

    await expectRedirectTo(signIn(initialAuthFormState, formData), "/dudes/1");

    expect(apiFetch).toHaveBeenCalledWith("/auth/token", {
      method: "POST",
      body: { identifier: EMAIL, password: PASSWORD },
    });
  });

  it("sends no extra keys to Nest", async () => {
    apiAnswers(badCredentials);

    await signIn(initialAuthFormState, signInForm({ role: "admin", $ACTION_ID_x: "" }));

    expect(apiFetch).toHaveBeenCalledWith("/auth/token", {
      method: "POST",
      body: { identifier: EMAIL, password: PASSWORD },
    });
  });

  it.each([
    ["a plain object", { identifier: EMAIL, password: PASSWORD }],
    ["undefined", undefined],
    ["null", null],
    ["a string", "identifier=x"],
  ])("treats %s in place of FormData as empty fields", async (_label, input) => {
    apiAnswers(badRequest(["identifier should not be empty"]));

    const state = await signIn(initialAuthFormState, input as unknown as FormData);

    expect(apiFetch).toHaveBeenCalledWith("/auth/token", {
      method: "POST",
      body: { identifier: "", password: "" },
    });
    expect(state.values).toEqual({ identifier: "" });
  });
});

describe("signUp", () => {
  it("signs up, then signs in with the email, then redirects to a safe next", async () => {
    apiAnswers(createdUser, pair);

    await expectRedirectTo(
      signUp(initialAuthFormState, signUpForm({ next: "/?welcome=1" })),
      "/?welcome=1",
    );

    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(apiFetch).toHaveBeenNthCalledWith(1, "/auth/sign-up", {
      method: "POST",
      body: {
        username: USERNAME,
        email: EMAIL,
        password: PASSWORD,
        profile: { displayName: DISPLAY_NAME },
      },
    });
    expect(apiFetch).toHaveBeenNthCalledWith(2, "/auth/token", {
      method: "POST",
      body: { identifier: EMAIL, password: PASSWORD },
    });
    expect(cookieStore.set).toHaveBeenCalledWith(
      SESSION_COOKIE,
      pair.accessToken,
      expect.any(Object),
    );
  });

  it.each(["//evil.example.com", "https://evil.example.com", "/api/auth/logout"])(
    "redirects to / for the bad next %s",
    async (next) => {
      apiAnswers(createdUser, pair);

      await expectRedirectTo(signUp(initialAuthFormState, signUpForm({ next })), "/");
    },
  );

  it.each([
    ["EMAIL_TAKEN", "email", AUTH_MESSAGES.emailTaken],
    ["USERNAME_TAKEN", "username", AUTH_MESSAGES.usernameTaken],
    ["DISPLAY_NAME_TAKEN", "displayName", AUTH_MESSAGES.displayNameTaken],
  ])("puts the 409 %s under %s", async (code, field, message) => {
    apiAnswers(conflict(code));

    const state = await signUp(initialAuthFormState, signUpForm());

    expect(state).toEqual({
      fieldErrors: { [field]: [message] },
      formError: null,
      values: { email: EMAIL, displayName: DISPLAY_NAME, username: USERNAME },
      accountReady: false,
      next: "/",
    });
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expectNoPassword(state);
    expectNoCookies();
  });

  it.each([
    ["VALUE_TAKEN", "VALUE_TAKEN"],
    ["no code", undefined],
    ["an unknown code", "SOMETHING_NEW"],
  ])("gives a 409 with %s as a form error", async (_label, code) => {
    apiAnswers(conflict(code));

    const state = await signUp(initialAuthFormState, signUpForm());

    expect(state.fieldErrors).toEqual({});
    expect(state.formError).toBe(
      "Somebody already took that, man. Try another email, username or display name.",
    );
    expect(state.formError).toBe(AUTH_MESSAGES.valueTaken);
  });

  it("puts 400 messages under their inputs, and profile.displayName's under displayName", async () => {
    apiAnswers(
      badRequest([
        "username must not contain spaces or @",
        "email must be an email",
        "password must be longer than or equal to 12 characters",
        "profile.displayName should not be empty",
      ]),
    );

    const state = await signUp(initialAuthFormState, signUpForm());

    expect(state.fieldErrors).toEqual({
      username: ["username must not contain spaces or @"],
      email: ["email must be an email"],
      password: ["password must be longer than or equal to 12 characters"],
      displayName: ["displayName should not be empty"],
    });
    expect(state.formError).toBeNull();
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expectNoPassword(state);
  });

  it("drops a leading profile. from Nest's messages and keeps the rest of its words", async () => {
    apiAnswers(
      badRequest([
        "profile.displayName must be longer than or equal to 2 characters",
        "profile.displayName must not contain invisible characters",
      ]),
    );

    const state = await signUp(initialAuthFormState, signUpForm());

    expect(state.fieldErrors).toEqual({
      displayName: [
        "displayName must be longer than or equal to 2 characters",
        "displayName must not contain invisible characters",
      ],
    });
    expect(state.formError).toBeNull();
  });

  it("drops a leading profile. from a message that becomes the form error", async () => {
    apiAnswers(
      badRequest([
        "profile.bio must be shorter than or equal to 280 characters",
        "property profile.avatar should not exist",
      ]),
    );

    const state = await signUp(initialAuthFormState, signUpForm());

    expect(state.fieldErrors).toEqual({});
    // Only a leading "profile." goes. One inside the message stays as Nest wrote it.
    expect(state.formError).toBe(
      "bio must be shorter than or equal to 280 characters. property profile.avatar should not exist.",
    );
  });

  it("leaves a message alone when it starts with profile but not profile.", async () => {
    apiAnswers(badRequest(["profileName must be a string", "username must be a string"]));

    const state = await signUp(initialAuthFormState, signUpForm());

    expect(state.fieldErrors).toEqual({ username: ["username must be a string"] });
    expect(state.formError).toBe("profileName must be a string.");
  });

  it("gives the 429 wait when sign-up itself is throttled", async () => {
    apiAnswers(tooMany(120));

    const state = await signUp(initialAuthFormState, signUpForm());

    expect(state.formError).toBe("Easy, man. Try again in 2 minutes.");
    expect(state.accountReady).toBe(false);
  });

  it.each([
    ["no answer", 0],
    ["a 500", 500],
  ])("gives the generic message when sign-up gets %s", async (_label, status) => {
    apiAnswers(apiError(status));

    const state = await signUp(initialAuthFormState, signUpForm());

    expect(state.formError).toBe(AUTH_MESSAGES.unavailable);
    expect(state.accountReady).toBe(false);
    expectNoCookies();
  });

  it.each([
    ["a 401", badCredentials],
    ["a 429", tooMany(60)],
    ["a 500", apiError(500)],
    ["no answer", apiError(0)],
  ])("returns the half-finished state when the sign-in step gets %s", async (_label, failure) => {
    apiAnswers(createdUser, failure);

    const state = await signUp(initialAuthFormState, signUpForm({ next: "/dudes/1" }));

    expect(state).toEqual({
      fieldErrors: {},
      formError: AUTH_MESSAGES.accountReady,
      values: { email: EMAIL, displayName: DISPLAY_NAME, username: USERNAME },
      accountReady: true,
      next: "/dudes/1",
    });
    expectNoPassword(state);
    expectNoCookies();
  });

  it("gives a safe next with the half-finished state", async () => {
    apiAnswers(createdUser, apiError(500));

    const state = await signUp(initialAuthFormState, signUpForm({ next: "//evil.example.com" }));

    expect(state.accountReady).toBe(true);
    expect(state.next).toBe("/");
  });

  it("lets a plain Error surface from either step", async () => {
    const bug = new Error("API_URL is not set.");
    apiAnswers(bug);

    await expect(signUp(initialAuthFormState, signUpForm())).rejects.toBe(bug);

    apiAnswers(createdUser, bug);

    await expect(signUp(initialAuthFormState, signUpForm())).rejects.toBe(bug);
    expectNoCookies();
  });

  it("logs nothing", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    apiAnswers(conflict("EMAIL_TAKEN"), createdUser, apiError(500), createdUser, pair);

    await signUp(initialAuthFormState, signUpForm());
    await signUp(initialAuthFormState, signUpForm());
    await expect(signUp(initialAuthFormState, signUpForm())).rejects.toThrow(RedirectSignal);

    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
});

// QA-2. A member who signs in again in the same browser has a sign-in in the
// old cookies. Nest ends it before the new cookies replace it, so Sign out
// later ends every sign-in this browser made.
describe("ending the sign-in the browser already has", () => {
  // Made-up tokens from an earlier sign-in in this browser, in the shapes
  // readSessionCookies accepts: a three-part JWT, and 43 base64url characters.
  const OLD_ACCESS_TOKEN = "eyJhbGciOiJIUzI1NiJ9.old-access-token-for-tests.signature";
  const OLD_REFRESH_TOKEN = "old-refresh-token-for-tests_0123456789abcde";

  const SIGN_OUT_CALL = ["/auth/sign-out", { method: "POST", token: OLD_ACCESS_TOKEN }];

  function savedCookies(values: Record<string, string>) {
    cookieStore.get.mockImplementation((name: string) =>
      Object.hasOwn(values, name) ? { name, value: values[name] } : undefined,
    );
  }

  function alreadySignedIn() {
    savedCookies({ [SESSION_COOKIE]: OLD_ACCESS_TOKEN, [REFRESH_COOKIE]: OLD_REFRESH_TOKEN });
  }

  function signOutFailure(status: number): ApiRequestError {
    return new ApiRequestError(`POST /auth/sign-out answered ${status}`, {
      status,
      body: status === 0 ? null : { statusCode: status, message: `bad ${OLD_ACCESS_TOKEN}` },
    });
  }

  function apiPaths(): unknown[] {
    return vi.mocked(apiFetch).mock.calls.map(([path]) => path);
  }

  // Each action, and the answers that lead it up to a new token pair.
  const actions = [
    {
      name: "signIn",
      label: "Sign in",
      run: () => signIn(initialAuthFormState, signInForm()),
      beforePair: [] as unknown[],
      paths: ["/auth/token"],
    },
    {
      name: "signUp",
      label: "Sign up",
      run: () => signUp(initialAuthFormState, signUpForm()),
      beforePair: [createdUser] as unknown[],
      paths: ["/auth/sign-up", "/auth/token"],
    },
  ];

  describe.each(actions)("$name", ({ label, run, beforePair, paths }) => {
    it("ends the old sign-in with the old access token, after the new pair and before the cookies", async () => {
      alreadySignedIn();
      apiAnswers(...beforePair, pair, undefined);

      await expectRedirectTo(run(), "/");

      expect(apiPaths()).toEqual([...paths, "/auth/sign-out"]);
      expect(apiFetch).toHaveBeenLastCalledWith(...SIGN_OUT_CALL);

      // The order is token, then sign-out, then the cookies.
      const order = vi.mocked(apiFetch).mock.invocationCallOrder;
      const tokenAt = order[paths.length - 1] ?? Infinity;
      const signOutAt = order[paths.length] ?? Infinity;
      const firstSetAt = Math.min(...cookieStore.set.mock.invocationCallOrder);
      expect(tokenAt).toBeLessThan(signOutAt);
      expect(signOutAt).toBeLessThan(firstSetAt);
      expect(cookieStore.set).toHaveBeenCalledWith(
        SESSION_COOKIE,
        pair.accessToken,
        expect.any(Object),
      );
      expect(cookieStore.set).toHaveBeenCalledWith(
        REFRESH_COOKIE,
        pair.refreshToken,
        expect.any(Object),
      );
    });

    it("does not call sign-out when there is no session cookie", async () => {
      savedCookies({});
      apiAnswers(...beforePair, pair);

      await expectRedirectTo(run(), "/");

      expect(apiPaths()).toEqual(paths);
    });

    it("does not call sign-out with only the refresh cookie, which a Server Action never gets", async () => {
      savedCookies({ [REFRESH_COOKIE]: OLD_REFRESH_TOKEN });
      apiAnswers(...beforePair, pair);

      await expectRedirectTo(run(), "/");

      expect(apiPaths()).toEqual(paths);
    });

    it.each([
      ["a 401", badCredentials],
      ["a 429", tooMany(60)],
      ["a 500", apiError(500)],
      ["no answer", apiError(0)],
    ])("never ends the old sign-in when POST /auth/token gets %s", async (_label, failure) => {
      alreadySignedIn();
      apiAnswers(...beforePair, failure);

      await run();

      expect(apiPaths()).toEqual(paths);
      expectNoCookies();
    });

    it.each([
      ["a 401", 401],
      ["a 429", 429],
      ["a 500", 500],
      ["no answer", 0],
    ])("still finishes the new sign-in when sign-out gets %s", async (_label, status) => {
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      alreadySignedIn();
      apiAnswers(...beforePair, pair, signOutFailure(status));

      await expectRedirectTo(run(), "/");

      expect(cookieStore.set).toHaveBeenCalledWith(
        SESSION_COOKIE,
        pair.accessToken,
        expect.any(Object),
      );
    });

    it("logs a failed sign-out by method, path and status only, never a token", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
      alreadySignedIn();
      apiAnswers(...beforePair, pair, signOutFailure(500));

      await expectRedirectTo(run(), "/");

      expect(error).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(`${label}: POST /auth/sign-out answered 500.`);
      const logged = JSON.stringify(warn.mock.calls);
      for (const token of [
        OLD_ACCESS_TOKEN,
        OLD_REFRESH_TOKEN,
        pair.accessToken,
        pair.refreshToken,
      ]) {
        expect(logged).not.toContain(token);
      }
    });

    it("lets a plain Error from sign-out surface, and sets no cookie", async () => {
      alreadySignedIn();
      const bug = new Error("API_URL is not set.");
      apiAnswers(...beforePair, pair, bug);

      await expect(run()).rejects.toBe(bug);

      expect(cookieStore.set).not.toHaveBeenCalled();
      expect(redirect).not.toHaveBeenCalled();
    });

    it("logs nothing when sign-out succeeds", async () => {
      const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
        vi.spyOn(console, method).mockImplementation(() => undefined),
      );
      alreadySignedIn();
      apiAnswers(...beforePair, pair, undefined);

      await expectRedirectTo(run(), "/");

      for (const spy of spies) {
        expect(spy).not.toHaveBeenCalled();
      }
    });
  });

  it("never ends the old sign-in when sign-up itself fails", async () => {
    alreadySignedIn();
    apiAnswers(conflict("EMAIL_TAKEN"));

    await signUp(initialAuthFormState, signUpForm());

    expect(apiPaths()).toEqual(["/auth/sign-up"]);
    expectNoCookies();
  });
});

describe("signUp with hostile FormData", () => {
  it("counts files and missing keys as empty strings", async () => {
    apiAnswers(badRequest(["email should not be empty"]));
    const formData = form({
      email: new Blob([EMAIL]),
      password: new File([PASSWORD], "password.txt"),
    });

    const state = await signUp(initialAuthFormState, formData);

    expect(apiFetch).toHaveBeenCalledWith("/auth/sign-up", {
      method: "POST",
      body: { username: "", email: "", password: "", profile: { displayName: "" } },
    });
    expect(state.values).toEqual({ email: "", displayName: "", username: "" });
    expect(state.next).toBe("/");
  });

  it("takes only the first of repeated keys", async () => {
    apiAnswers(createdUser, pair);
    const formData = form({
      email: [EMAIL, "e2e-ffffffffffff@example.com"],
      displayName: [DISPLAY_NAME, "Walter"],
      username: [USERNAME, "e2e-ffffffffffff"],
      password: [PASSWORD, "another-password-entirely"],
    });

    await expectRedirectTo(signUp(initialAuthFormState, formData), "/");

    expect(apiFetch).toHaveBeenNthCalledWith(1, "/auth/sign-up", {
      method: "POST",
      body: {
        username: USERNAME,
        email: EMAIL,
        password: PASSWORD,
        profile: { displayName: DISPLAY_NAME },
      },
    });
  });

  it("sends no extra keys to Nest, even a nested-looking one", async () => {
    apiAnswers(conflict("EMAIL_TAKEN"));

    await signUp(
      initialAuthFormState,
      signUpForm({ "profile.bio": "x", "profile[displayName]": "Walter", role: "admin" }),
    );

    expect(apiFetch).toHaveBeenCalledWith("/auth/sign-up", {
      method: "POST",
      body: {
        username: USERNAME,
        email: EMAIL,
        password: PASSWORD,
        profile: { displayName: DISPLAY_NAME },
      },
    });
  });

  it("treats a plain object in place of FormData as empty fields", async () => {
    apiAnswers(badRequest(["email should not be empty"]));

    await signUp(initialAuthFormState, { email: EMAIL } as unknown as FormData);

    expect(apiFetch).toHaveBeenCalledWith("/auth/sign-up", {
      method: "POST",
      body: { username: "", email: "", password: "", profile: { displayName: "" } },
    });
  });
});
