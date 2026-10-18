import "server-only";
import { API_TIMEOUT_MS, ApiRequestError, apiBaseUrl } from "@/lib/api";
import { bffHeadersFrom } from "@/lib/bff-headers";
import { bffTarget } from "@/lib/bff-paths";
import { assertSameOrigin } from "@/lib/origin";
import { logFailure } from "@/lib/route-responses";
import { verifySession } from "@/lib/session";

// The proxy that lets Client Components call Nest. The browser calls
// /api/bff/<path>; this handler adds the member's Bearer from the session
// cookie and calls ${API_URL}/<path>. Page scripts never see the token.
//
// The checks run in this order, so a refused request learns nothing more:
//   1. The path: anything outside the allow-list, or any path trick, gets 404.
//   2. The Origin, on POST, PATCH and DELETE: a cross-origin write gets 403.
//   3. The session: none, or an expired token, gets 401, with no Nest call.
// The handler's own answers are small JSON bodies shaped like Nest's,
// `{ statusCode, message }`, so clientFetch reads one shape whoever answered.
//
// Only the method, the query string, Content-Type and the body go to Nest,
// with the Bearer and, when BFF_SECRET is set, X-Bff-Secret and X-Client-Ip
// (lib/bff-headers.ts), so Nest counts rate limits by the visitor's address.
// Only the status, Content-Type, Retry-After and the body
// come back. It never refreshes: a 401 from Nest passes through, and
// clientFetch refreshes and retries.
//
// Helmet's headers on Nest's answer are dropped with the rest, so every
// answer from here sets its own: Cache-Control: no-store, and
// X-Content-Type-Options: nosniff, so a browser never reads a body as
// anything but its Content-Type.
//
// HEAD, PUT and OPTIONS aren't exported. Next answers 405 to PUT, and fills
// in OPTIONS and HEAD itself.

type Method = "GET" | "POST" | "PATCH" | "DELETE";

interface BffContext {
  params: Promise<{ path: string[] }>;
}

// RequestInit with `duplex`, which Node's fetch needs for a streamed body
// and TypeScript's DOM types don't list yet.
type StreamingRequestInit = RequestInit & { duplex?: "half" };

// The only headers copied from Nest's answer.
const ANSWER_HEADERS = ["Content-Type", "Retry-After"] as const;

// Set on every answer, Nest's or the handler's own.
const OWN_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

// Statuses whose Response may not carry a body.
const NO_BODY_STATUSES = new Set([204, 205, 304]);

const LOG_LABEL = "BFF request";

/** Reads from Nest through the allow-list. No Origin check: a GET changes nothing. */
export async function GET(request: Request, context: BffContext): Promise<Response> {
  return forward("GET", request, context);
}

/** Writes to Nest through the allow-list, same-origin only. */
export async function POST(request: Request, context: BffContext): Promise<Response> {
  return forward("POST", request, context);
}

/** Writes to Nest through the allow-list, same-origin only. */
export async function PATCH(request: Request, context: BffContext): Promise<Response> {
  return forward("PATCH", request, context);
}

/** Deletes at Nest through the allow-list, same-origin only. Sends no body. */
export async function DELETE(request: Request, context: BffContext): Promise<Response> {
  return forward("DELETE", request, context);
}

async function forward(method: Method, request: Request, context: BffContext): Promise<Response> {
  const { path } = await context.params;
  const target = bffTarget(path, new URL(request.url).search);
  if (target === null) {
    return errorAnswer(404, "Not Found");
  }

  // Next checks Origin on Server Actions only. Without this, any site could
  // post a form here and write as the member.
  if (method !== "GET" && !assertSameOrigin(request)) {
    return errorAnswer(403, "Forbidden");
  }

  const session = await verifySession();
  if (session === null) {
    return errorAnswer(401, "Unauthorized");
  }

  let base: string;
  try {
    base = apiBaseUrl();
  } catch (error) {
    logFailure(LOG_LABEL, error);
    return errorAnswer(502, "Bad Gateway");
  }

  let answer: Response;
  try {
    answer = await fetch(`${base}${target}`, nestInit(method, request, session.accessToken));
  } catch (cause) {
    // The path only: the query can hold what a member typed.
    const route = `${method} ${target.split("?", 1)[0]}`;
    logFailure(LOG_LABEL, new ApiRequestError(`${route} got no answer`, { status: 0, cause }));
    return errorAnswer(502, "Bad Gateway");
  }

  return passThrough(answer);
}

// A fresh set of headers: the Bearer, the visitor's address pair when there
// is one, and Content-Type when a body goes too. Nothing else from the
// browser, so no Cookie, Authorization, hop-by-hop or X-Forwarded header
// reaches Nest, and no X-Bff-Secret or X-Client-Ip the browser made up.
function nestInit(method: Method, request: Request, accessToken: string): StreamingRequestInit {
  const headers = new Headers({
    ...bffHeadersFrom(request.headers),
    Authorization: `Bearer ${accessToken}`,
  });
  const init: StreamingRequestInit = {
    method,
    headers,
    // Answers belong to one member and one moment. Never keep them in Next's
    // fetch cache.
    cache: "no-store",
    // Nest never redirects. If it did, the Bearer must not follow.
    redirect: "manual",
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  };

  const sendsBody = method === "POST" || method === "PATCH";
  if (sendsBody && request.body !== null) {
    const contentType = request.headers.get("content-type");
    if (contentType !== null) {
      headers.set("Content-Type", contentType);
    }
    init.body = request.body;
    init.duplex = "half";
  }

  return init;
}

// Nest's status and body stream, with only the headers in ANSWER_HEADERS,
// plus OWN_HEADERS. Never Set-Cookie: the only cookies this app sets are its
// own.
function passThrough(answer: Response): Response {
  const headers = new Headers(OWN_HEADERS);
  for (const name of ANSWER_HEADERS) {
    const value = answer.headers.get(name);
    if (value !== null) {
      headers.set(name, value);
    }
  }
  const body = NO_BODY_STATUSES.has(answer.status) ? null : answer.body;
  return new Response(body, { status: answer.status, headers });
}

// The handler's own answer, in the shape of Nest's built-in exceptions.
function errorAnswer(statusCode: number, message: string): Response {
  return Response.json({ statusCode, message }, { status: statusCode, headers: OWN_HEADERS });
}
