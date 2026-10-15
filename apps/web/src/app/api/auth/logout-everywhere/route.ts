import "server-only";
import type { TokenPair } from "@dudesphere/api-types";

import { readTokenSid, sameSignIn } from "@/lib/access-token";
import { ApiRequestError, apiFetch } from "@/lib/api";
import { assertSameOrigin } from "@/lib/origin";
import { refreshOnce } from "@/lib/refresh";
import { logFailure, seeOther, seeOtherToHome } from "@/lib/route-responses";
import { clearSessionCookies, hasDuplicateRefreshCookie, readSessionCookies } from "@/lib/session";

// Sign out on every device. The "Sign out everywhere" button is a plain
// <form method="post" action="/api/auth/logout-everywhere">, so it works with
// JavaScript off. It is a Route Handler, not a Server Action, because the
// refresh cookie is sent only to paths under /api/auth, and it may be needed
// here.
//
// A refresh cookie sent more than once means a sibling subdomain planted
// one beside the member's (hasDuplicateRefreshCookie in lib/session.ts).
// Next would read the planted one. A refresh would then sign out the
// attacker's account everywhere and tell the member it was theirs. So then
// no call uses the refresh token. The session cookie is `__Host-`, which no subdomain can
// plant, so its access token is still the member's: this tries
// sign-out-everywhere with it once. Success goes to "/" as usual. No access
// token, or any failure, goes to "/?signout=partial".
//
// A single planted refresh cookie, with the member's own gone, looks like
// any other. So the refresh step is tied to the session cookie: it runs only
// when the session's access token has a `sid`, and the fresh pair must carry
// the same `sid` (sameSignIn in lib/access-token.ts) before its access token
// signs anyone out everywhere. Otherwise the 303 goes to "/?signout=partial",
// never "/", and no further call is made.
//
// The refresh cookie's token is never revoked. Nothing ties it to this
// sign-in, and revoking a planted one would end the attacker's sign-in while
// the member's stays live. When signing out everywhere fails, this device's
// sign-in is ended, if it can be, with POST /auth/sign-out and the newest
// access token tied to it: the session's own, or a fresh one whose `sid`
// matched. Nest's sign-out ends that `sid`'s whole refresh-token family.
//
// Only POST is exported. Next answers 405 to every other method.

const LOG_LABEL = "Sign out everywhere";

// Where the browser goes when only this device could be signed out. The home
// page reads `signout=partial` and tells the member so.
const PARTIAL_SIGN_OUT_PATH = "/?signout=partial";

// Where the browser goes when Nest refused the refresh token with a 401: this
// sign-in had already ended, for example through Sign out everywhere on
// another device. The home page reads `signout=ended` and tells the member so.
const ENDED_SIGN_OUT_PATH = "/?signout=ended";

/**
 * "done": every sign-in ended, or there was none. "already-ended": Nest
 * refused the refresh token. "untied": the refresh token couldn't be tied to
 * the session cookie's sign-in, so it wasn't used, or its pair was dropped.
 */
type Outcome = "done" | "already-ended" | "untied";

/**
 * Checks the Origin, asks Nest to end every sign-in of this member, clears
 * both cookies, and sends the browser to "/" with a 303, so it follows with
 * a GET.
 *
 * If Nest refuses the refresh token with a 401, this sign-in had already
 * ended, so there is nothing to end, and the 303 goes to
 * "/?signout=ended". If Nest can't end every sign-in for any other reason,
 * the route tries once to end this device's sign-in with the newest tied
 * access token Nest didn't refuse, and the 303 goes to "/?signout=partial"
 * so the member learns that other devices may still be signed in. When the
 * refresh token can't be tied to the session cookie's sign-in, it isn't
 * used, and the 303 goes to "/?signout=partial" too. Either way the cookies
 * go, whether or not Nest could be reached.
 *
 * With the refresh cookie sent twice, only the access token is used, once:
 * "/" when Nest ends every sign-in, "/?signout=partial" otherwise.
 */
export async function POST(request: Request): Promise<Response> {
  // Next checks Origin on Server Actions only. Without this, any site could
  // post a form here and sign the member out everywhere.
  if (!assertSameOrigin(request)) {
    return new Response(null, { status: 403 });
  }

  if (hasDuplicateRefreshCookie(request)) {
    return signOutWithAccessTokenOnly();
  }

  const { accessToken, refreshToken } = await readSessionCookies();
  const { outcome, fallbackToken } = await signOutEverywhere(accessToken, refreshToken);

  if (outcome === null && fallbackToken !== null) {
    await signOutThisDevice(fallbackToken);
  }

  await clearSessionCookies();
  if (outcome === "done") return seeOtherToHome();
  if (outcome === "already-ended") return seeOther(ENDED_SIGN_OUT_PATH);
  return seeOther(PARTIAL_SIGN_OUT_PATH);
}

/**
 * How signOutEverywhere ended. `outcome` is null when Nest did not end every
 * sign-in; the failure is already logged. `fallbackToken` is then the newest
 * access token tied to this sign-in that Nest didn't refuse with a 401, for
 * ending this device's sign-in at least, or null when there is none.
 */
interface Attempt {
  outcome: Outcome | null;
  fallbackToken: string | null;
}

// The access token lasts 15 minutes, so it is often gone or out of date by
// the time a member signs out. Then the refresh token is swapped once for a
// fresh pair, and the call is tried once more with the fresh access token.
// The fresh pair is used for that one call only and never saved: the cookies
// are cleared straight after. The swap goes through refreshOnce, the refresh
// handler's single flight, so a sign-out that races a refresh of the same
// token shares its one call to Nest instead of getting "reused". A pair it
// holds for 10 seconds gets the same `sid` check as any other.
//
// Gives "already-ended" when Nest refuses the refresh token with a 401: its
// sign-in is over. Gives "untied" when the refresh token can't be tied to the
// session cookie's sign-in: no access token, no `sid` in it, or a fresh pair
// with another `sid`. Gives a null outcome when Nest did not end every
// sign-in for any other reason. A 401 to the access token with no refresh
// cookie counts as that too: Nest doesn't say whether the token was out of
// date or its sign-in ended, so nobody knows whether other devices are still
// signed in.
async function signOutEverywhere(
  accessToken: string | null,
  refreshToken: string | null,
): Promise<Attempt> {
  if (accessToken) {
    try {
      await endEverySignIn(accessToken);
      return { outcome: "done", fallbackToken: null };
    } catch (error) {
      if (!refreshToken || !isUnauthorized(error)) {
        return failed(error, accessToken);
      }
    }
  }

  // No tokens at all: this browser had no sign-in to end.
  if (!refreshToken) {
    return { outcome: "done", fallbackToken: null };
  }

  // Nothing to tie the refresh token to, so it isn't used.
  if (!accessToken || readTokenSid(accessToken) === null) {
    return { outcome: "untied", fallbackToken: null };
  }

  let pair: TokenPair;
  try {
    pair = await refreshOnce(refreshToken);
  } catch (error) {
    if (isUnauthorized(error)) {
      return { outcome: "already-ended", fallbackToken: null };
    }
    // The session's access token was refused just before, so it can't help.
    return failed(error, null);
  }

  if (!sameSignIn(accessToken, pair.accessToken)) {
    // Never a value: either token may be live.
    console.warn(
      `${LOG_LABEL}: skipped the refresh token, it doesn't belong to the session cookie's sign-in.`,
    );
    return { outcome: "untied", fallbackToken: null };
  }

  try {
    await endEverySignIn(pair.accessToken);
    return { outcome: "done", fallbackToken: null };
  } catch (error) {
    return failed(error, pair.accessToken);
  }
}

// Logs a failed step, never a token, and keeps `accessToken` for the
// fallback unless Nest refused it with a 401.
function failed(error: unknown, accessToken: string | null): Attempt {
  logFailure(LOG_LABEL, error);
  return { outcome: null, fallbackToken: isUnauthorized(error) ? null : accessToken };
}

// The path for a refresh cookie sent twice: never touches either refresh
// token. Tries sign-out-everywhere once with the session's access token,
// clears the cookies after Nest answers, and says partial unless it worked.
async function signOutWithAccessTokenOnly(): Promise<Response> {
  // Never the values: one of them is the member's live refresh token.
  console.warn(
    `${LOG_LABEL}: skipped the refresh token, the refresh cookie was sent more than once.`,
  );

  const { accessToken } = await readSessionCookies();
  let done = false;
  if (accessToken) {
    try {
      await endEverySignIn(accessToken);
      done = true;
    } catch (error) {
      logFailure(LOG_LABEL, error);
    }
  }

  await clearSessionCookies();
  return done ? seeOtherToHome() : seeOther(PARTIAL_SIGN_OUT_PATH);
}

function endEverySignIn(accessToken: string): Promise<void> {
  return apiFetch<void>("/auth/sign-out-everywhere", { method: "POST", token: accessToken });
}

// The fallback: ends this device's sign-in at least, once, logging any
// failure. Nest's POST /auth/sign-out ends the sign-in the access token's
// `sid` names, its whole refresh-token family included
// (SignInsRepository.endSignIn), so only a token tied to this sign-in is
// ever passed here.
async function signOutThisDevice(accessToken: string): Promise<void> {
  try {
    await apiFetch<void>("/auth/sign-out", { method: "POST", token: accessToken });
  } catch (error) {
    logFailure(LOG_LABEL, error);
  }
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 401;
}
