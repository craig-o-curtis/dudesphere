import "server-only";
import type { TokenPair } from "@dudesphere/api-types";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

import { readTokenSid, sameSignIn } from "@/lib/access-token";
import { ApiRequestError } from "@/lib/api";
import { loginHref, safeNextPath } from "@/lib/next-path";
import { assertSameOrigin } from "@/lib/origin";
import { refreshOnce } from "@/lib/refresh";
import { logFailure, seeOther } from "@/lib/route-responses";
import {
  clearSessionCookies,
  hasDuplicateRefreshCookie,
  readSessionCookies,
  SESSION_COOKIE,
  startSession,
} from "@/lib/session";

// Swaps the refresh token for a fresh pair. It is a Route Handler under
// /api/auth because the refresh cookie travels only to paths under
// /api/auth: no page, Server Component or Server Action can see it.
//
// GET serves proxy. When a member's access token is about to run out, proxy
// sends the navigation here with `?next=<path and query>`, and this sends it
// straight back with a 303. A client-side navigation arrives with Next's own
// `_rsc` query too; only `next` is read, and Next adds `_rsc` back itself.
// GET needs no Origin check: the worst a cross-site GET can do is swap the
// member's tokens for fresh ones, which it never sees.
//
// POST serves the browser's fetch wrapper (lib/client-fetch.ts) and answers
// with a status only, after an Origin check.
//
// Both refresh only when `__Host-session` came with the request. A sibling
// subdomain can plant a refresh cookie: `__Secure-` allows a Domain
// attribute, `__Host-` doesn't. Swapping a planted token would sign the
// browser in to the attacker's account. Proxy sends a navigation here only
// when the session cookie is there, so a GET without it came from somewhere
// else, such as a cross-site navigation. A POST without it comes from the
// app's own clientFetch on a signed-out visit, which the Origin check can't
// stop because it is same-origin. Either way, no session cookie counts as
// signed out. A session cookie that is there but unreadable, which proxy
// also sends here, is refused by the sign-in check below.
//
// Neither refreshes when the request carries `__Secure-refresh` more than
// once (hasDuplicateRefreshCookie in lib/session.ts). That is a planted
// cookie beside the member's own, and Next would read the planted one. This
// handler can't clear it, but uses neither, and treats the member as signed
// out.
//
// A single planted cookie, with the member's own gone (evicted, say), looks
// like any other. So the refresh token is tied to the session cookie it came
// with: the fresh access token must carry the same `sid`, the sign-in id,
// as the old one in `__Host-session` (sameSignIn in lib/access-token.ts). A
// mismatch, or no `sid` on either side, saves nothing, clears both cookies
// and counts as signed out. With no `sid` in the session cookie, Nest isn't
// asked at all. A pair held for 10 seconds is keyed by the refresh token
// alone, so every request is checked against its own session cookie.
//
// Every failure clears the session cookie, so proxy lets the next request
// through as anonymous, and nothing loops while the browser accepts the
// cookie writes (see "Refresh" in context/frontend-architecture.md).
//
// Every answer carries Set-Cookie, so every answer says Cache-Control:
// no-store, and no cache keeps one.
//
// Only GET and POST are exported. Next answers 405 to every other method.

const LOG_LABEL = "Refresh";

/** Where a member lands when `next` is missing or unsafe. */
const FALLBACK_PATH = "/feed";

// Sending a member to sign-in with `next` pointing back at a sign-in page
// would only bring them back to the form. Those go to plain "/login".
const SIGN_IN_PATHS = new Set(["/login", "/signup"]);

/**
 * "refreshed": Nest swapped the token for a pair of the same sign-in.
 * "signed-out": there was no session cookie or no refresh cookie, the
 * refresh cookie came twice, the pair belongs to another sign-in (or either
 * side has no `sid`), or Nest refused the token with a 401. "unavailable": Nest answered 5xx or
 * 429, didn't answer, or the app's setup is broken.
 */
type Outcome =
  | { kind: "refreshed"; pair: TokenPair }
  | { kind: "signed-out" }
  | { kind: "unavailable" };

/**
 * Refreshes, then sends the browser back to `next` with a 303.
 *
 * Success saves the fresh pair and goes to the safe `next`, or "/feed". A
 * missing session cookie, a missing refresh cookie, a refresh cookie sent
 * twice, a pair from another sign-in or a 401 from Nest clears both cookies
 * and goes to sign-in, with `next` kept. Nest down clears only
 * the session cookie, keeps the unspent refresh cookie, and goes to `next`,
 * where the page renders signed out or its own check sends the member to
 * sign-in.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const next = request.nextUrl.searchParams.get("next");
  const sessionToken = await rawSessionCookie();
  const outcome =
    sessionToken === null ? await signedOut() : await refreshFromCookie(request, sessionToken);

  switch (outcome.kind) {
    case "refreshed":
      return redirectTo(await startSession(outcome.pair, next, FALLBACK_PATH));
    case "signed-out":
      return redirectTo(signInPath(next));
    case "unavailable":
      return redirectTo(safeNextPath(next, FALLBACK_PATH));
  }
}

/**
 * Checks the Origin, then refreshes. Answers 204 on success, 401 when there
 * is no session cookie, no refresh cookie, a refresh cookie sent twice, a
 * pair from another sign-in, or Nest refused the token, and 503 when Nest is
 * down. The cookies change exactly as
 * they do for GET. A failed Origin check answers 403 and touches no cookie.
 */
export async function POST(request: Request): Promise<Response> {
  // Next checks Origin on Server Actions only. Without this, any site could
  // spend the member's refresh token from a form.
  if (!assertSameOrigin(request)) {
    return statusOnly(403);
  }

  const sessionToken = await rawSessionCookie();
  const outcome =
    sessionToken === null ? await signedOut() : await refreshFromCookie(request, sessionToken);

  switch (outcome.kind) {
    case "refreshed":
      await startSession(outcome.pair, null);
      return statusOnly(204);
    case "signed-out":
      return statusOnly(401);
    case "unavailable":
      return statusOnly(503);
  }
}

// The part GET and POST share: refuses a refresh cookie sent more than once,
// reads the refresh cookie, asks Nest once through refreshOnce, checks the
// fresh pair belongs to the session cookie's sign-in, and clears the cookies
// a failure calls for. Saving a fresh pair is left to the caller, which
// knows where the member goes next.
async function refreshFromCookie(request: Request, sessionToken: string): Promise<Outcome> {
  if (hasDuplicateRefreshCookie(request)) {
    // Never the values: one of them is the member's live refresh token.
    console.warn(`${LOG_LABEL}: refused, the refresh cookie was sent more than once.`);
    return signedOut();
  }

  const { refreshToken } = await readSessionCookies();
  if (refreshToken === null) {
    return signedOut();
  }

  // Nothing to tie the refresh token to, so don't spend it.
  if (readTokenSid(sessionToken) === null) {
    return refusedOtherSignIn();
  }

  let pair: TokenPair;
  try {
    pair = await refreshOnce(refreshToken);
  } catch (error) {
    // Nest says "invalid", "expired" or "reused". Each one means the same
    // here: this sign-in is over. That is no failure of the app, so no log.
    if (error instanceof ApiRequestError && error.status === 401) {
      await clearSessionCookies();
      return { kind: "signed-out" };
    }
    // Logs the method, path and status only: never a token or Nest's body.
    logFailure(LOG_LABEL, error);
    await clearSessionCookie();
    return { kind: "unavailable" };
  }

  if (!sameSignIn(sessionToken, pair.accessToken)) {
    return refusedOtherSignIn();
  }
  return { kind: "refreshed", pair };
}

// The refresh token isn't tied to the session cookie's sign-in. Never logs a
// value: either token may be live.
async function refusedOtherSignIn(): Promise<Outcome> {
  console.warn(
    `${LOG_LABEL}: refused, the refresh token doesn't belong to the session cookie's sign-in.`,
  );
  return signedOut();
}

// Ends the sign-in on this browser: clears both cookies.
async function signedOut(): Promise<Outcome> {
  await clearSessionCookies();
  return { kind: "signed-out" };
}

// The request's `__Host-session` value as it came, well formed or not, or
// null when it is missing or empty. readSessionCookies can't tell a
// malformed cookie from a missing one. An empty value counts as missing, as
// it does in proxy.
async function rawSessionCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value || null;
}

// Clears `__Host-session` only. The refresh token wasn't spent, so its cookie
// stays for the next try. The options match lib/session.ts: a `__Host-`
// cookie cleared without Secure, or at another path, is refused by the
// browser.
async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

// The sign-in link that brings the member back to the safe `next`, or
// "/feed". A `next` that is itself a sign-in page gives plain "/login".
function signInPath(next: string | null): string {
  const safe = safeNextPath(next, FALLBACK_PATH);
  return SIGN_IN_PATHS.has(pathnameOf(safe)) ? "/login" : loginHref(safe);
}

// The path part of a safe `next`, decoded, with no trailing "/", so
// "/login/" and "/%6Cogin" count as "/login" too, as Next's router sees them.
// safeNextPath has already checked that the path decodes.
function pathnameOf(safePath: string): string {
  const path = decodeURIComponent(safePath.split(/[?#]/, 1)[0] ?? "");
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

// lib/route-responses.ts's 303, marked no-store.
function redirectTo(path: string): Response {
  const response = seeOther(path);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function statusOnly(status: number): Response {
  return new Response(null, { status, headers: { "Cache-Control": "no-store" } });
}
