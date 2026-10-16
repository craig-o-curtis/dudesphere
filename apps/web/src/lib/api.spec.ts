// @vitest-environment node
// lib/api.ts runs on the server only, so these tests run in Node, with
// Node's own fetch, Response and AbortSignal.

import { readFileSync } from "node:fs";

import type { TokenPair } from "@dudesphere/api-types";

import { API_TIMEOUT_MS, ApiRequestError, apiFetch, mapValidationMessages } from "./api";

// The real package throws when imported outside a React Server Component
// build. Next resolves it to an empty module on the server; this does the same.
vi.mock("server-only", () => ({}));

const API_URL = "http://api.example.com";

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function sentInit(): RequestInit {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const init = fetchMock.mock.calls[0]?.[1];
  if (!init) throw new Error("fetch was called with no options");
  return init;
}

function sentHeaders(): Headers {
  return new Headers(sentInit().headers);
}

async function caught(promise: Promise<unknown>): Promise<ApiRequestError> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ApiRequestError);
  return error as ApiRequestError;
}

const pair: TokenPair = {
  accessToken: "access-token-for-tests",
  refreshToken: "refresh-token-for-tests",
  expiresIn: 900,
};

beforeEach(() => {
  vi.stubEnv("API_URL", API_URL);
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("the module", () => {
  it("starts with import 'server-only', so a client bundle that imports it fails to build", () => {
    const source = readFileSync(new URL("./api.ts", import.meta.url), "utf8");

    expect(source.trimStart().startsWith('import "server-only";')).toBe(true);
  });
});

describe("apiFetch: the request", () => {
  it("calls API_URL plus the path", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));

    await apiFetch("/users/me");

    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://api.example.com/users/me");
  });

  it("drops a trailing slash from API_URL, so the URL has no double slash", async () => {
    vi.stubEnv("API_URL", "http://api.example.com/");
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await apiFetch("/auth/token", { method: "POST", body: {} });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://api.example.com/auth/token");
  });

  it.each([
    ["no leading slash", "auth/token"],
    ["a protocol-relative URL", "//evil.example.com/auth/token"],
    ["a full URL", "https://evil.example.com/auth/token"],
  ])("refuses a path with %s and never calls fetch", async (_what, path) => {
    await expect(apiFetch(path)).rejects.toThrow(/must start with a single "\/"/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws a clear error, not an ApiRequestError, when API_URL is unset", async () => {
    vi.stubEnv("API_URL", undefined);

    const error = await apiFetch("/users/me").catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ApiRequestError);
    expect((error as Error).message).toMatch(/API_URL is not set/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws the same clear error when API_URL is empty", async () => {
    vi.stubEnv("API_URL", "");

    await expect(apiFetch("/users/me")).rejects.toThrow(/API_URL is not set/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("adds Authorization: Bearer when given a token", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await apiFetch("/users/me", { token: pair.accessToken });

    expect(sentHeaders().get("Authorization")).toBe("Bearer access-token-for-tests");
  });

  it.each([
    ["no token", undefined],
    ["a null token", null],
    ["an empty token", ""],
  ])("sends no Authorization header with %s", async (_what, token) => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await apiFetch("/auth/token", { method: "POST", body: {}, token });

    expect(sentHeaders().has("Authorization")).toBe(false);
  });

  it("merges extraHeaders into the request", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await apiFetch("/auth/token", {
      method: "POST",
      body: {},
      token: pair.accessToken,
      extraHeaders: { "X-Bff-Secret": "a-made-up-secret", "X-Client-Ip": "192.0.2.10" },
    });

    const headers = sentHeaders();
    expect(headers.get("X-Bff-Secret")).toBe("a-made-up-secret");
    expect(headers.get("X-Client-Ip")).toBe("192.0.2.10");
    expect(headers.get("Authorization")).toBe("Bearer access-token-for-tests");
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("never lets extraHeaders replace the Bearer or the content type", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await apiFetch("/auth/token", {
      method: "POST",
      body: {},
      token: pair.accessToken,
      extraHeaders: { authorization: "Bearer someone-else", "content-type": "text/plain" },
    });

    const headers = sentHeaders();
    expect(headers.get("Authorization")).toBe("Bearer access-token-for-tests");
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("sends the body as JSON, with the method given", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, pair));
    const body = { identifier: "e2e-walter@example.com", password: "a-long-secret-1" };

    await apiFetch<TokenPair>("/auth/token", { method: "POST", body });

    const init = sentInit();
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify(body));
    expect(sentHeaders().get("Content-Type")).toBe("application/json");
    expect(sentHeaders().get("Accept")).toBe("application/json");
  });

  it("uses POST when there is a body and no method", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await apiFetch("/auth/token/revoke", { body: { refreshToken: pair.refreshToken } });

    expect(sentInit().method).toBe("POST");
  });

  it("uses GET with no body and no Content-Type when given neither", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await apiFetch("/users/me", { token: pair.accessToken });

    const init = sentInit();
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    expect(sentHeaders().has("Content-Type")).toBe(false);
  });

  it("opts out of Next's fetch cache and sets a timeout signal", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await apiFetch("/users/me");

    const init = sentInit();
    expect(init.cache).toBe("no-store");
    expect(timeoutSpy).toHaveBeenCalledWith(API_TIMEOUT_MS);
    expect(init.signal).toBe(timeoutSpy.mock.results[0]?.value);
    timeoutSpy.mockRestore();
  });

  it("waits longer than Nest's own 10 second limit, so Nest's 408 arrives first", () => {
    expect(API_TIMEOUT_MS).toBeGreaterThan(10_000);
  });
});

describe("apiFetch: a 2xx answer", () => {
  it("answers the parsed JSON", async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, pair));

    await expect(apiFetch<TokenPair>("/auth/token", { method: "POST", body: {} })).resolves.toEqual(
      pair,
    );
  });

  it("answers undefined on 204", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(
      apiFetch<void>("/auth/token/revoke", {
        method: "POST",
        body: { refreshToken: pair.refreshToken },
      }),
    ).resolves.toBeUndefined();
  });

  // Nest's POST /auth/password/forgot answers 202 with no body at all.
  it("answers undefined on 202 with an empty body", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 202 }));

    await expect(
      apiFetch<void>("/auth/password/forgot", {
        method: "POST",
        body: { email: "e2e-0a1b2c3d4e5f@example.com" },
      }),
    ).resolves.toBeUndefined();
  });

  it("answers the parsed JSON on a 202 with a body", async () => {
    fetchMock.mockResolvedValue(jsonResponse(202, { queued: true }));

    await expect(apiFetch("/auth/password/forgot", { method: "POST", body: {} })).resolves.toEqual({
      queued: true,
    });
  });

  // QA-3 (AUTH-9 review round 1). A 200 route answers JSON, such as the pair
  // from POST /auth/token/refresh. An empty one must stay an ApiRequestError
  // the caller handles, not an undefined it reads `accessToken` from.
  it.each([
    ["an empty", ""],
    ["a null", null],
  ])(
    "throws an ApiRequestError with the real status on a 200 with %s body",
    async (_label, body) => {
      fetchMock.mockResolvedValue(new Response(body, { status: 200 }));

      const error = await caught(
        apiFetch<TokenPair>("/auth/token/refresh", {
          method: "POST",
          body: { refreshToken: pair.refreshToken },
        }),
      );

      expect(error).toBeInstanceOf(ApiRequestError);
      expect(error.status).toBe(200);
      expect(error.body).toBeNull();
    },
  );

  it("throws an ApiRequestError on a 201 with an empty body", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 201 }));

    const error = await caught(apiFetch<TokenPair>("/auth/token", { method: "POST", body: {} }));

    expect(error.status).toBe(201);
  });

  it("throws an ApiRequestError on a 202 whose body isn't JSON", async () => {
    fetchMock.mockResolvedValue(new Response("accepted", { status: 202 }));

    const error = await caught(apiFetch("/auth/password/forgot", { method: "POST", body: {} }));

    expect(error.status).toBe(202);
  });

  it("throws an ApiRequestError with the real status when a 200 body isn't JSON", async () => {
    fetchMock.mockResolvedValue(new Response("<html>oops</html>", { status: 200 }));

    const error = await caught(apiFetch("/users/me"));

    expect(error.status).toBe(200);
    expect(error.body).toBeNull();
  });
});

describe("apiFetch: a non-2xx answer", () => {
  it("401 BAD_CREDENTIALS carries the status, the body and the code", async () => {
    const body = {
      statusCode: 401,
      message: "Invalid username, email or password",
      error: "Unauthorized",
      errorCode: "BAD_CREDENTIALS",
    };
    fetchMock.mockResolvedValue(jsonResponse(401, body));

    const error = await caught(apiFetch("/auth/token", { method: "POST", body: {} }));

    expect(error.status).toBe(401);
    expect(error.body).toEqual(body);
    expect(error.errorCode).toBe("BAD_CREDENTIALS");
    expect(error.retryAfterSeconds).toBeNull();
    expect(error.fieldErrors).toEqual({});
    expect(error.formErrors).toEqual([]);
  });

  it("401 from the auth package keeps its own lower-case code", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, {
        statusCode: 401,
        message: "Unauthorized",
        errorCode: "missing_credentials",
      }),
    );

    const error = await caught(apiFetch("/auth/sign-out-everywhere", { method: "POST" }));

    expect(error.errorCode).toBe("missing_credentials");
  });

  it.each([
    ["EMAIL_TAKEN", "Email already registered"],
    ["USERNAME_TAKEN", "Username already taken"],
    ["DISPLAY_NAME_TAKEN", "Display name already taken"],
    ["VALUE_TAKEN", "That value is already taken"],
  ])("409 %s carries its code and no field errors", async (errorCode, message) => {
    const body = { statusCode: 409, message, error: "Conflict", errorCode };
    fetchMock.mockResolvedValue(jsonResponse(409, body));

    const error = await caught(apiFetch("/auth/sign-up", { method: "POST", body: {} }));

    expect(error.status).toBe(409);
    expect(error.body).toEqual(body);
    expect(error.errorCode).toBe(errorCode);
    expect(error.fieldErrors).toEqual({});
    expect(error.formErrors).toEqual([]);
  });

  const rateLimited = {
    statusCode: 429,
    message: "Too many requests. Try again later.",
    error: "Too Many Requests",
    errorCode: "RATE_LIMITED",
  };

  it("429 with Retry-After gives the wait in seconds", async () => {
    fetchMock.mockResolvedValue(jsonResponse(429, rateLimited, { "Retry-After": "61" }));

    const error = await caught(apiFetch("/auth/token", { method: "POST", body: {} }));

    expect(error.status).toBe(429);
    expect(error.errorCode).toBe("RATE_LIMITED");
    expect(error.retryAfterSeconds).toBe(61);
  });

  it("429 with no Retry-After gives null", async () => {
    fetchMock.mockResolvedValue(jsonResponse(429, rateLimited));

    const error = await caught(apiFetch("/auth/token", { method: "POST", body: {} }));

    expect(error.status).toBe(429);
    expect(error.retryAfterSeconds).toBeNull();
  });

  // Nest sends whole seconds. The HTTP-date form would need a Date to read,
  // and the app never uses Date, so it counts as no header.
  it.each([
    ["an HTTP date", "Wed, 21 Oct 2026 07:28:00 GMT"],
    ["a negative number", "-5"],
    ["a fraction", "1.5"],
    ["an empty value", ""],
    ["words", "soon"],
  ])("429 with %s in Retry-After gives null", async (_what, value) => {
    fetchMock.mockResolvedValue(jsonResponse(429, rateLimited, { "Retry-After": value }));

    const error = await caught(apiFetch("/auth/token", { method: "POST", body: {} }));

    expect(error.retryAfterSeconds).toBeNull();
  });

  it("400 maps the validation messages to fields and to the form", async () => {
    const body = {
      statusCode: 400,
      message: [
        "username must not contain spaces or @",
        "profile.displayName must be longer than or equal to 2 characters",
        "property extra should not exist",
      ],
      error: "Bad Request",
    };
    fetchMock.mockResolvedValue(jsonResponse(400, body));

    const error = await caught(apiFetch("/auth/sign-up", { method: "POST", body: {} }));

    expect(error.status).toBe(400);
    expect(error.body).toEqual(body);
    expect(error.errorCode).toBeNull();
    expect(error.fieldErrors).toEqual({
      username: ["username must not contain spaces or @"],
      displayName: ["profile.displayName must be longer than or equal to 2 characters"],
    });
    expect(error.formErrors).toEqual(["property extra should not exist"]);
  });

  it("400 with one message string puts it in formErrors", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, { statusCode: 400, message: "Bad request", error: "Bad Request" }),
    );

    const error = await caught(apiFetch("/auth/token", { method: "POST", body: {} }));

    expect(error.fieldErrors).toEqual({});
    expect(error.formErrors).toEqual(["Bad request"]);
  });

  it("5xx carries the status and its body", async () => {
    const body = {
      statusCode: 503,
      message: "The database is not answering. Try again soon.",
      error: "Service Unavailable",
      errorCode: "DATABASE_UNAVAILABLE",
    };
    fetchMock.mockResolvedValue(jsonResponse(503, body));

    const error = await caught(apiFetch("/auth/token", { method: "POST", body: {} }));

    expect(error.status).toBe(503);
    expect(error.errorCode).toBe("DATABASE_UNAVAILABLE");
  });

  it("a non-JSON error body gives a null body and empty errors", async () => {
    fetchMock.mockResolvedValue(
      new Response("<html><body>Bad Gateway</body></html>", {
        status: 502,
        headers: { "Content-Type": "text/html" },
      }),
    );

    const error = await caught(apiFetch("/auth/token", { method: "POST", body: {} }));

    expect(error.status).toBe(502);
    expect(error.body).toBeNull();
    expect(error.errorCode).toBeNull();
    expect(error.fieldErrors).toEqual({});
    expect(error.formErrors).toEqual([]);
  });

  it.each([
    ["a JSON string", "just a string"],
    ["a JSON array", ["a", "b"]],
    ["an object with no statusCode", { message: "no status" }],
    ["a message list that holds a number", { statusCode: 400, message: ["email must be", 42] }],
    ["an errorCode that isn't a string", { statusCode: 400, message: "x", errorCode: 7 }],
  ])("JSON that isn't an ApiError (%s) gives a null body", async (_what, json) => {
    fetchMock.mockResolvedValue(jsonResponse(400, json));

    const error = await caught(apiFetch("/auth/token", { method: "POST", body: {} }));

    expect(error.status).toBe(400);
    expect(error.body).toBeNull();
    expect(error.errorCode).toBeNull();
    expect(error.fieldErrors).toEqual({});
    expect(error.formErrors).toEqual([]);
  });

  it("names the method, path and status in its message, and never the token or body", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, { statusCode: 401, message: "Unauthorized", errorCode: "BAD_CREDENTIALS" }),
    );

    const error = await caught(
      apiFetch("/auth/token", {
        method: "POST",
        body: { identifier: "e2e-walter@example.com", password: "a-long-secret-1" },
        token: pair.accessToken,
      }),
    );

    expect(error.name).toBe("ApiRequestError");
    expect(error.message).toBe("POST /auth/token answered 401");
    expect(error.message).not.toContain("a-long-secret-1");
    expect(error.message).not.toContain(pair.accessToken);
  });
});

describe("apiFetch: no answer", () => {
  it("a network failure throws an ApiRequestError with status 0", async () => {
    const cause = new TypeError("fetch failed");
    fetchMock.mockRejectedValue(cause);

    const error = await caught(apiFetch("/auth/token", { method: "POST", body: {} }));

    expect(error.status).toBe(0);
    expect(error.body).toBeNull();
    expect(error.errorCode).toBeNull();
    expect(error.retryAfterSeconds).toBeNull();
    expect(error.fieldErrors).toEqual({});
    expect(error.formErrors).toEqual([]);
    expect(error.message).toBe("POST /auth/token got no answer");
    expect(error.cause).toBe(cause);
  });

  it("a timeout throws an ApiRequestError with status 0", async () => {
    fetchMock.mockRejectedValue(new DOMException("The operation timed out.", "TimeoutError"));

    const error = await caught(apiFetch("/users/me"));

    expect(error.status).toBe(0);
  });
});

// Each message below is exactly what Nest's global ValidationPipe answers
// (whitelist, forbidNonWhitelisted, transform) for CreateUserDto at
// POST /auth/sign-up and SignInDto at POST /auth/token. They were taken by
// running bodies through the real pipe, so a change to a DTO's wording that
// moves a message to another field shows up here.
describe("mapValidationMessages", () => {
  it.each([
    // CreateUserDto: username
    ["username must be at most 24 characters", "username"],
    ["username must not contain the NUL character", "username"],
    ["username must be longer than or equal to 3 characters", "username"],
    ["username should not be empty", "username"],
    ["username must be a string", "username"],
    ["username must not contain spaces or @", "username"],
    // CreateUserDto: email
    ["email must be at most 100 characters", "email"],
    ["email must be an email", "email"],
    ["email should not be empty", "email"],
    ["email must be a string", "email"],
    // CreateUserDto: password
    ["password must be shorter than or equal to 128 characters", "password"],
    ["password must be longer than or equal to 12 characters", "password"],
    ["password should not be empty", "password"],
    ["password must be a string", "password"],
    // CreateProfileDto, nested under profile
    ["profile.displayName must be longer than or equal to 2 characters", "displayName"],
    ["profile.displayName must be at most 50 characters", "displayName"],
    ["profile.displayName must not contain invisible or control characters", "displayName"],
    ["profile.displayName must not contain the NUL character", "displayName"],
    // SignInDto
    ["identifier must not contain the NUL character", "identifier"],
    ["identifier must be at most 100 characters", "identifier"],
    ["identifier should not be empty", "identifier"],
    ["identifier must be a string", "identifier"],
  ] as const)("puts %j under %s", (message, field) => {
    expect(mapValidationMessages([message])).toEqual({
      fieldErrors: { [field]: [message] },
      formErrors: [],
    });
  });

  it.each([
    // forbidNonWhitelisted, at the top level and nested
    "property extra should not exist",
    "profile.property extra should not exist",
    // An extra field named like a real one still starts with "property"
    "property password should not exist",
    "property email should not exist",
    // The whole profile object is missing
    "profile should not be null or undefined",
    // A path we don't show a field for
    "profile.bio must be a string",
    "refreshToken must be a string",
    // Not a property path at all
    "Bad request",
    "",
    // Names that live on Object.prototype must not match
    "constructor must be a string",
    "__proto__ must be a string",
    "toString must be a string",
  ])("puts %j in formErrors", (message) => {
    expect(mapValidationMessages([message])).toEqual({
      fieldErrors: {},
      formErrors: [message],
    });
  });

  it("matches the whole leading path, not a prefix of it", () => {
    expect(mapValidationMessages(["usernames must be a string", "emailAddress is odd"])).toEqual({
      fieldErrors: {},
      formErrors: ["usernames must be a string", "emailAddress is odd"],
    });
  });

  it("keeps every message for a field, in Nest's order", () => {
    const messages = [
      "username must be at most 24 characters",
      "username must not contain the NUL character",
      "username must be longer than or equal to 3 characters",
      "username should not be empty",
      "username must be a string",
      "email must be at most 100 characters",
      "email must be an email",
      "email should not be empty",
      "email must be a string",
      "password must be shorter than or equal to 128 characters",
      "password must be longer than or equal to 12 characters",
      "password should not be empty",
      "password must be a string",
      "profile should not be null or undefined",
    ];

    expect(mapValidationMessages(messages)).toEqual({
      fieldErrors: {
        username: messages.slice(0, 5),
        email: messages.slice(5, 9),
        password: messages.slice(9, 13),
      },
      formErrors: ["profile should not be null or undefined"],
    });
  });

  it("gives empty results for no messages", () => {
    expect(mapValidationMessages([])).toEqual({ fieldErrors: {}, formErrors: [] });
  });
});
