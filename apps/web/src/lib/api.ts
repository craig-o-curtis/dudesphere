import "server-only";
import type { ApiError, ApiErrorCode } from "@dudesphere/api-types";

// The one way the web app calls the NestJS API. Server Actions and Route
// Handlers use it; the browser never does. It reads API_URL from the server's
// environment, adds the Bearer itself, and turns any failed answer into one
// ApiRequestError.

/**
 * How long a call may take before it gives up, in milliseconds. Nest answers
 * 408 after 10 seconds (REQUEST_TIMEOUT_MS in apps/api), so this waits a
 * little longer, and Nest's own answer arrives first.
 */
export const API_TIMEOUT_MS = 15_000;

// The 2xx statuses whose answer may have no body: 204 No Content, and 202
// Accepted, which Nest's POST /auth/password/forgot sends with none.
const EMPTY_BODY_STATUSES: ReadonlySet<number> = new Set([202, 204]);

/** The form fields a Nest validation message can belong to. */
export type ApiFieldName = "username" | "email" | "password" | "identifier" | "displayName";

/** Nest's validation messages, grouped by the form field each one is about. */
export type FieldErrors = Partial<Record<ApiFieldName, string[]>>;

export interface MappedValidationMessages {
  fieldErrors: FieldErrors;
  /** Messages that belong to no field, such as "property extra should not exist". */
  formErrors: string[];
}

export interface ApiFetchOptions {
  /** Defaults to POST when there is a body, and to GET when there isn't. */
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Sent as JSON. */
  body?: unknown;
  /** An access token. Sent as `Authorization: Bearer <token>` when present. */
  token?: string | null;
  /**
   * Added to the request. They can't replace Authorization or Content-Type.
   * API-10 sends X-Bff-Secret and X-Client-Ip through here.
   */
  extraHeaders?: Record<string, string>;
}

/**
 * Thrown by apiFetch when Nest answers outside 2xx, or doesn't answer.
 *
 * Keep it on the server. Its message names the route, and its body is Nest's
 * own wording. Map it to the app's copy before anything reaches the page.
 */
export class ApiRequestError extends Error {
  override readonly name = "ApiRequestError";
  /** The HTTP status, or 0 when there was no answer: a network failure or the timeout. */
  readonly status: number;
  /** Nest's error body, or null when the body isn't JSON in that shape. */
  readonly body: ApiError | null;
  /** `body.errorCode`, or null when there is none. */
  readonly errorCode: ApiErrorCode | (string & {}) | null;
  /** Whole seconds from the Retry-After header, or null when it's missing or not a number. */
  readonly retryAfterSeconds: number | null;
  /** From a 400 body's message list. Empty for every other status. */
  readonly fieldErrors: FieldErrors;
  /** From a 400 body: the messages that belong to no field. Empty for every other status. */
  readonly formErrors: string[];

  constructor(
    message: string,
    details: {
      status: number;
      body?: ApiError | null;
      retryAfterSeconds?: number | null;
      cause?: unknown;
    },
  ) {
    super(message, { cause: details.cause });
    this.status = details.status;
    this.body = details.body ?? null;
    this.errorCode = this.body?.errorCode ?? null;
    this.retryAfterSeconds = details.retryAfterSeconds ?? null;

    const mapped = validationMessagesOf(details.status, this.body);
    this.fieldErrors = mapped.fieldErrors;
    this.formErrors = mapped.formErrors;
  }
}

/**
 * Calls the API at `${API_URL}${path}` and answers the parsed JSON, or
 * undefined when a 204 or a 202 has an empty body. Nest's 202, from
 * POST /auth/password/forgot, has none.
 *
 * Throws ApiRequestError when Nest answers outside 2xx, when any other 2xx
 * body isn't JSON (an empty 200 included, since its caller expects JSON), and
 * when there is no answer at all, with status 0. Throws a plain Error when
 * API_URL is unset or the path isn't a path, since both are bugs in the app,
 * not answers.
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const url = `${apiBaseUrl()}${checkedPath(path)}`;
  const method = options.method ?? (options.body === undefined ? "GET" : "POST");
  const route = `${method} ${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: requestHeaders(options),
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      // Auth answers belong to one member and one moment. Never keep them in
      // Next's fetch cache.
      cache: "no-store",
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch (cause) {
    throw new ApiRequestError(`${route} got no answer`, { status: 0, cause });
  }

  if (!response.ok) {
    throw new ApiRequestError(`${route} answered ${response.status}`, {
      status: response.status,
      body: await errorBodyOf(response),
      retryAfterSeconds: retryAfterSecondsOf(response.headers),
    });
  }

  // Only a 204 or a 202 may come with no body. Every other 2xx is a route
  // that answers JSON, so an empty one throws below, as JSON.parse("") does,
  // rather than handing its caller undefined.
  try {
    const text = await response.text();
    if (text === "" && EMPTY_BODY_STATUSES.has(response.status)) {
      return undefined as T;
    }
    return JSON.parse(text) as T;
  } catch (cause) {
    throw new ApiRequestError(`${route} answered ${response.status} with a body that isn't JSON`, {
      status: response.status,
      cause,
    });
  }
}

// A message's leading property path, and the form field it belongs to.
// A Map, not an object, so a path such as "constructor" can't match.
const FIELD_BY_PATH = new Map<string, ApiFieldName>([
  ["username", "username"],
  ["email", "email"],
  ["password", "password"],
  ["identifier", "identifier"],
  ["profile.displayName", "displayName"],
]);

/**
 * Sorts Nest's validation messages by the field each one is about.
 *
 * ValidationPipe starts every message with the property path, such as
 * "username must not contain spaces or @" or "profile.displayName must be at
 * most 50 characters". The words before the first space pick the field.
 * Anything else, such as "property extra should not exist", goes to
 * formErrors. Each message is kept word for word, in Nest's order.
 */
export function mapValidationMessages(messages: readonly string[]): MappedValidationMessages {
  const fieldErrors: FieldErrors = {};
  const formErrors: string[] = [];

  for (const message of messages) {
    const field = FIELD_BY_PATH.get(message.split(" ", 1)[0] ?? "");
    if (field) {
      (fieldErrors[field] ??= []).push(message);
    } else {
      formErrors.push(message);
    }
  }

  return { fieldErrors, formErrors };
}

/**
 * The API's origin from API_URL, with no trailing slash. Throws a plain Error
 * when API_URL is unset, since that is a bug in the app's setup. The
 * /api/bff Route Handler uses it too.
 */
export function apiBaseUrl(): string {
  const base = process.env.API_URL;
  if (!base) {
    throw new Error("API_URL is not set. Set it to the API's origin in apps/web/.env.local.");
  }
  return base.replace(/\/+$/, "");
}

// Only a path on the API, so a caller can never point the Bearer at another host.
function checkedPath(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error(`apiFetch path must start with a single "/". Got ${JSON.stringify(path)}.`);
  }
  return path;
}

function requestHeaders({ body, token, extraHeaders }: ApiFetchOptions): Headers {
  const headers = new Headers(extraHeaders);
  headers.set("Accept", "application/json");
  if (body === undefined) {
    headers.delete("Content-Type");
  } else {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  } else {
    headers.delete("Authorization");
  }
  return headers;
}

async function errorBodyOf(response: Response): Promise<ApiError | null> {
  try {
    const parsed: unknown = JSON.parse(await response.text());
    return isApiError(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isApiError(value: unknown): value is ApiError {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;

  const { statusCode, message, error, errorCode } = value as Record<string, unknown>;
  const messageOk =
    typeof message === "string" ||
    (Array.isArray(message) && message.every((entry) => typeof entry === "string"));

  return (
    typeof statusCode === "number" &&
    messageOk &&
    (error === undefined || typeof error === "string") &&
    (errorCode === undefined || typeof errorCode === "string")
  );
}

// Nest sends whole seconds. The other form, an HTTP date, would need a Date
// to read, so it counts as no header.
function retryAfterSecondsOf(headers: Headers): number | null {
  const value = headers.get("Retry-After")?.trim();
  return value && /^\d+$/.test(value) ? Number(value) : null;
}

function validationMessagesOf(status: number, body: ApiError | null): MappedValidationMessages {
  if (status !== 400 || body === null) {
    return { fieldErrors: {}, formErrors: [] };
  }
  if (typeof body.message === "string") {
    return { fieldErrors: {}, formErrors: [body.message] };
  }
  return mapValidationMessages(body.message);
}
