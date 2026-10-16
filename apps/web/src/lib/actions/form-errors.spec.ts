// @vitest-environment node
// These helpers run inside Server Actions, so these tests run in Node.

import type { ApiError } from "@dudesphere/api-types";

import { ApiRequestError } from "@/lib/api";

import { AUTH_MESSAGES } from "./auth-state";
import {
  apiErrorOrThrow,
  sharedFormError,
  textField,
  tooManyMessage,
  validationErrors,
} from "./form-errors";

// The real package throws when imported outside a React Server Component
// build. Next resolves it to an empty module on the server; this does the same.
vi.mock("server-only", () => ({}));

function apiError(
  status: number,
  body: ApiError | null = null,
  retryAfterSeconds: number | null = null,
): ApiRequestError {
  return new ApiRequestError(`test answered ${status}`, { status, body, retryAfterSeconds });
}

function badRequest(message: string | string[]): ApiRequestError {
  return apiError(400, { statusCode: 400, message, error: "Bad Request" });
}

describe("textField", () => {
  it("reads a string value", () => {
    const formData = new FormData();
    formData.append("email", "e2e-0a1b2c3d4e5f@example.com");

    expect(textField(formData, "email")).toBe("e2e-0a1b2c3d4e5f@example.com");
  });

  it("gives the first value of a repeated key", () => {
    const formData = new FormData();
    formData.append("token", "first");
    formData.append("token", "second");

    expect(textField(formData, "token")).toBe("first");
  });

  it.each([
    ["a missing key", new FormData()],
    ["a value that isn't FormData", { email: "e2e-0a1b2c3d4e5f@example.com" }],
    ["null", null],
  ])("gives an empty string for %s", (_label, formData) => {
    expect(textField(formData, "email")).toBe("");
  });

  it("gives an empty string for a file", () => {
    const formData = new FormData();
    formData.append("email", new Blob(["not text"]));

    expect(textField(formData, "email")).toBe("");
  });
});

describe("apiErrorOrThrow", () => {
  it("answers an ApiRequestError as it is", () => {
    const error = apiError(500);

    expect(apiErrorOrThrow(error)).toBe(error);
  });

  it("throws anything else again", () => {
    const bug = new Error("API_URL is not set.");

    expect(() => apiErrorOrThrow(bug)).toThrow(bug);
  });
});

describe("tooManyMessage", () => {
  it.each([
    [0, "Easy, man. Try again in 1 minute."],
    [1, "Easy, man. Try again in 1 minute."],
    [60, "Easy, man. Try again in 1 minute."],
    [61, "Easy, man. Try again in 2 minutes."],
    [900, "Easy, man. Try again in 15 minutes."],
    [null, "Easy, man. Try again in a few minutes."],
  ])("for Retry-After %s says %j", (seconds, message) => {
    expect(tooManyMessage(seconds)).toBe(message);
  });
});

describe("sharedFormError", () => {
  it("says how long to wait on a 429", () => {
    expect(sharedFormError(apiError(429, null, 120))).toBe("Easy, man. Try again in 2 minutes.");
  });

  it.each([0, 401, 404, 500, 503])("says it's unavailable on %s", (status) => {
    expect(sharedFormError(apiError(status))).toBe(AUTH_MESSAGES.unavailable);
  });
});

describe("validationErrors", () => {
  it("puts messages for the form's inputs under them, in Nest's order", () => {
    const error = badRequest([
      "password must be longer than or equal to 12 characters",
      "password must be a string",
    ]);

    expect(validationErrors(error, ["password"])).toEqual({
      fieldErrors: {
        password: [
          "password must be longer than or equal to 12 characters",
          "password must be a string",
        ],
      },
      formError: null,
    });
  });

  it("folds messages for inputs not on the form into one form error", () => {
    const error = badRequest([
      "email must be an email",
      "username must not contain spaces or @",
      "property extra should not exist.",
    ]);

    expect(validationErrors(error, ["email"])).toEqual({
      fieldErrors: { email: ["email must be an email"] },
      formError: "property extra should not exist. username must not contain spaces or @.",
    });
  });

  it('drops a leading "profile." from the display name', () => {
    const error = badRequest(["profile.displayName must be at most 50 characters"]);

    expect(validationErrors(error, ["displayName"])).toEqual({
      fieldErrors: { displayName: ["displayName must be at most 50 characters"] },
      formError: null,
    });
    expect(validationErrors(error, ["email"]).formError).toBe(
      "displayName must be at most 50 characters.",
    );
  });

  it("makes a string message a form error", () => {
    expect(validationErrors(badRequest("Invalid or expired link"), ["password"])).toEqual({
      fieldErrors: {},
      formError: "Invalid or expired link.",
    });
  });

  it("says it's unavailable when the 400 has no messages", () => {
    expect(validationErrors(badRequest([]), ["email"])).toEqual({
      fieldErrors: {},
      formError: AUTH_MESSAGES.unavailable,
    });
  });
});
