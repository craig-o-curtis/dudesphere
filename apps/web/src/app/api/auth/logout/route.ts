import "server-only";
import type { TokenPair } from "@dudesphere/api-types";

import { readTokenSid, sameSignIn } from "@/lib/access-token";
import { ApiRequestError, apiFetch } from "@/lib/api";
import { assertSameOrigin } from "@/lib/origin";
import { refreshOnce } from "@/lib/refresh";
import { logFailure, seeOther, seeOtherToHome } from "@/lib/route-responses";
import { clearSessionCookies, hasDuplicateRefreshCookie, readSessionCookies } from "@/lib/session";

// Sign out on this device. The "Sign out" button is a plain
// <form method="post" action="/api/auth/logout">, so it works with
// JavaScript off. It is a Route Handler, not a Server Action, because the
// refresh cookie is sent only to paths under /api/auth, and a Server Action
// posts to the page's own path.
//
// The access token comes first. `__Host-session` can't be planted, and
// Nest's POST /auth/sign-out ends exactly the sign-in its `sid` names: every
// refresh token of its family is revoked (SignInsRepository.endSignIn), and
// its access tokens stop on their next request. So no revoke follows.
//
// The refresh token is only a fallback, for an access token Nest refuses
// with a 401, most often because it is out of date. A refresh cookie can be
// planted by a sibling subdomain (`__Secure-` allows a Domain attribute), so
// it is used only when it can be tied to this browser's sign-in:
// - not when it was sent more than once (hasDuplicateRefreshCookie);
// - not when the session cookie has no `sid` to tie it to;
// - and the fresh pair it swaps to must carry the session cookie's `sid`
//   (sameSignIn) before its access token signs out.
// Otherwise the refresh token is never sent to Nest. Revoking a planted one
// would end the attacker's sign-in and leave the member's live.
//
// Every path clears both cookies. The 303 goes to "/" when Nest ended this
// sign-in, or when there was none, and to "/?signout=partial" otherwise, so
// the member learns the sign-out may not be complete.
//
// Only POST is exported. Next answers 405 to every other method.

const LOG_LABEL = "Sign out";

// The home page reads `signout=partial` and tells the member that the
// sign-out may not be complete.
const PARTIAL_SIGN_OUT_PATH = "/?signout=partial";

/** "done": Nest ended this sign-in, or there was none. "partial": anything else. */
type Outcome = "done" | "partial";

/**
 * Checks the Origin, asks Nest to end this device's sign-in, clears both
 * cookies, and sends the browser to "/" with a 303, so it follows with a GET.
 * When Nest could not be shown to end the sign-in, the 303 goes to
 * "/?signout=partial". Either way the cookies go.
 */
export async function POST(request: Request): Promise<Response> {
  // Next checks Origin on Server Actions only. Without this, any site could
  // post a form here and sign the member out.
  if (!assertSameOrigin(request)) {
    return new Response(null, { status: 403 });
  }

  const duplicate = hasDuplicateRefreshCookie(request);
  if (duplicate) {
    // Never the values: one of them is the member's live refresh token.
    console.warn(
      `${LOG_LABEL}: skipped the refresh token, the refresh cookie was sent more than once.`,
    );
  }

  const { accessToken, refreshToken } = await readSessionCookies();
  const outcome = await endThisSignIn(accessToken, duplicate ? null : refreshToken, duplicate);

  await clearSessionCookies();
  return outcome === "done" ? seeOtherToHome() : seeOther(PARTIAL_SIGN_OUT_PATH);
}

// `refreshToken` is null when it may not be used: missing, malformed, or
// sent twice. `duplicate` says the browser held one, so there was a sign-in
// to end after all.
async function endThisSignIn(
  accessToken: string | null,
  refreshToken: string | null,
  duplicate: boolean,
): Promise<Outcome> {
  if (accessToken === null && refreshToken === null && !duplicate) {
    // No tokens at all: this browser had no sign-in to end.
    return "done";
  }

  if (accessToken !== null) {
    try {
      await signOutWith(accessToken);
      return "done";
    } catch (error) {
      // Only a 401 can be helped by a refresh. Anything else means Nest is
      // down or the app's setup is broken, and a refresh would fail too.
      if (!isUnauthorized(error)) {
        logFailure(LOG_LABEL, error);
        return "partial";
      }
    }
  }

  // Nothing to tie the refresh token to, so it isn't used. That covers no
  // session cookie, a malformed one and a token with no `sid`.
  if (refreshToken === null || accessToken === null || readTokenSid(accessToken) === null) {
    return "partial";
  }
  return signOutThroughRefresh(accessToken, refreshToken);
}

// Swaps the refresh token once, checks the fresh pair belongs to the session
// cookie's sign-in, and signs out with its access token. The fresh pair is
// used for that one call only and never saved: the cookies are cleared
// straight after.
//
// The swap goes through refreshOnce, the refresh handler's single flight, so
// a sign-out that races a refresh of the same token shares its one call to
// Nest. Two calls would get "reused". A pair refreshOnce holds for 10
// seconds is checked here like any other, against this request's own
// session cookie.
async function signOutThroughRefresh(sessionToken: string, refreshToken: string): Promise<Outcome> {
  let pair: TokenPair;
  try {
    pair = await refreshOnce(refreshToken);
  } catch (error) {
    // A 401: Nest says this refresh token's sign-in is over. Nobody can tell
    // whose it was, so no log, and partial.
    if (!isUnauthorized(error)) {
      logFailure(LOG_LABEL, error);
    }
    return "partial";
  }

  if (!sameSignIn(sessionToken, pair.accessToken)) {
    // Never a value: either token may be live.
    console.warn(
      `${LOG_LABEL}: skipped the refresh token, it doesn't belong to the session cookie's sign-in.`,
    );
    return "partial";
  }

  try {
    await signOutWith(pair.accessToken);
    return "done";
  } catch (error) {
    logFailure(LOG_LABEL, error);
    return "partial";
  }
}

// Ends the sign-in this access token belongs to, by its `sid`.
function signOutWith(accessToken: string): Promise<void> {
  return apiFetch<void>("/auth/sign-out", { method: "POST", token: accessToken });
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 401;
}
