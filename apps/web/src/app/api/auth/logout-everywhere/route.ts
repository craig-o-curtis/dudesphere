import "server-only";
import type { TokenPair } from "@dudesphere/api-types";

import { ApiRequestError, apiFetch } from "@/lib/api";
import { assertSameOrigin } from "@/lib/origin";
import { logFailure, seeOther, seeOtherToHome } from "@/lib/route-responses";
import { clearSessionCookies, readSessionCookies } from "@/lib/session";

// Sign out on every device. The "Sign out everywhere" button is a plain
// <form method="post" action="/api/auth/logout-everywhere">, so it works with
// JavaScript off. It is a Route Handler, not a Server Action, because the
// refresh cookie is sent only to paths under /api/auth, and it may be needed
// here.
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

/** "done": every sign-in ended, or there was none. "already-ended": Nest refused the refresh token. */
type Outcome = "done" | "already-ended";

/**
 * Checks the Origin, asks Nest to end every sign-in of this member, clears
 * both cookies, and sends the browser to "/" with a 303, so it follows with
 * a GET.
 *
 * If Nest refuses the refresh token with a 401, this sign-in had already
 * ended, so there is nothing to revoke, and the 303 goes to
 * "/?signout=ended". If Nest can't end every sign-in for any other reason,
 * this device's sign-in is still ended through the refresh cookie, as plain
 * sign-out does, and the 303 goes to "/?signout=partial" so the member learns
 * that other devices may still be signed in. Either way the cookies go,
 * whether or not Nest could be reached.
 */
export async function POST(request: Request): Promise<Response> {
  // Next checks Origin on Server Actions only. Without this, any site could
  // post a form here and sign the member out everywhere.
  if (!assertSameOrigin(request)) {
    return new Response(null, { status: 403 });
  }

  const { accessToken, refreshToken } = await readSessionCookies();
  let outcome: Outcome | null = null;
  try {
    outcome = await signOutEverywhere(accessToken, refreshToken);
  } catch (error) {
    logFailure(LOG_LABEL, error);
  }

  // After either outcome Nest holds no live sign-in for this refresh token,
  // so there is nothing left to revoke.
  if (outcome === null && refreshToken) {
    await revokeThisDevice(refreshToken);
  }

  await clearSessionCookies();
  if (outcome === "done") return seeOtherToHome();
  if (outcome === "already-ended") return seeOther(ENDED_SIGN_OUT_PATH);
  return seeOther(PARTIAL_SIGN_OUT_PATH);
}

// The access token lasts 15 minutes, so it is often gone or out of date by
// the time a member signs out. Then the refresh token is swapped once for a
// fresh pair, and the call is tried once more with the fresh access token.
// The fresh pair is used for that one call only and never saved: the cookies
// are cleared straight after.
//
// Gives "already-ended" when Nest refuses the refresh token with a 401: its
// sign-in is over. Throws when Nest did not end every sign-in for any other
// reason. A 401 to the access token with no refresh cookie throws too: Nest
// doesn't say whether the token was out of date or its sign-in ended, so
// nobody knows whether other devices are still signed in.
async function signOutEverywhere(
  accessToken: string | null,
  refreshToken: string | null,
): Promise<Outcome> {
  if (accessToken) {
    try {
      await endEverySignIn(accessToken);
      return "done";
    } catch (error) {
      if (!refreshToken || !isUnauthorized(error)) {
        throw error;
      }
    }
  }

  // No tokens at all: this browser had no sign-in to end.
  if (!refreshToken) {
    return "done";
  }

  let pair: TokenPair;
  try {
    pair = await apiFetch<TokenPair>("/auth/token/refresh", {
      method: "POST",
      body: { refreshToken },
    });
  } catch (error) {
    if (isUnauthorized(error)) return "already-ended";
    throw error;
  }
  await endEverySignIn(pair.accessToken);
  return "done";
}

function endEverySignIn(accessToken: string): Promise<void> {
  return apiFetch<void>("/auth/sign-out-everywhere", { method: "POST", token: accessToken });
}

// The fallback: ends this device's sign-in at least, once, ignoring errors.
// It sends the cookie's token even when the refresh step already swapped it.
// Nest's revoke finds a swapped token too and ends its whole sign-in, the
// fresh pair included (TokenService.revoke in @nestjs/authentication).
async function revokeThisDevice(refreshToken: string): Promise<void> {
  try {
    await apiFetch<void>("/auth/token/revoke", { method: "POST", body: { refreshToken } });
  } catch (error) {
    logFailure(LOG_LABEL, error);
  }
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 401;
}
