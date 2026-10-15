import "server-only";
import type { TokenPair } from "@dudesphere/api-types";
import { cookies } from "next/headers";

import { safeNextPath } from "@/lib/next-path";

// The one place that knows the sign-in cookies: their names, options and
// lifetimes. Server Actions and Route Handlers call it; page scripts never see
// a token, because both cookies are httpOnly. AUTH-8 adds verifySession,
// getMe and requireSession here.
//
// Lifetimes go in `maxAge`, in seconds, and never as an end time.

/**
 * Holds the access token. The `__Host-` prefix makes the browser refuse it
 * unless it is Secure, at path "/" and has no Domain, so no subdomain and no
 * plain-HTTP page can plant or replace it.
 */
export const SESSION_COOKIE = "__Host-session";

/**
 * Holds the refresh token. `__Host-` would force path "/", so this one is
 * `__Secure-`: the browser still refuses it unless it is Secure.
 */
export const REFRESH_COOKIE = "__Secure-refresh";

/**
 * The refresh cookie travels only to the Route Handlers under this path, not
 * with every page request.
 */
export const REFRESH_COOKIE_PATH = "/api/auth";

/**
 * Seven days, in seconds, the same as Nest's REFRESH_TOKEN_EXPIRES_IN. A bare
 * number until gmt's durationAs can take `{ days: 7 }` (gmt #308).
 */
export const REFRESH_MAX_AGE_SECONDS = 604_800;

// Fifteen minutes, in seconds: Nest's documented JWT_EXPIRES_IN. Used only if
// `expiresIn` is not a usable number. A bare number until gmt #308 lands.
const FALLBACK_SESSION_MAX_AGE_SECONDS = 900;

const SESSION_COOKIE_PATH = "/";

/**
 * The tokens in the request's cookies. A missing or empty cookie is null, and
 * so is one that isn't shaped like the token Nest issues.
 */
export interface SessionCookies {
  accessToken: string | null;
  refreshToken: string | null;
}

// Secure always, even in development: both prefixes demand it, and browsers
// treat http://localhost as secure. No `domain`, ever: `__Host-` forbids one.
function cookieOptions(path: string, maxAge: number) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path,
    maxAge,
  } as const;
}

// `expiresIn` comes from Nest, in whole seconds. The type alone doesn't prove
// that, so anything that is not a finite number of at least one second gets
// the documented 15 minutes, rather than a cookie that dies at once or never.
function sessionMaxAge(expiresIn: unknown): number {
  if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn) || expiresIn < 1) {
    return FALLBACK_SESSION_MAX_AGE_SECONDS;
  }
  return Math.floor(expiresIn);
}

// A JWT: three base64url parts, the last one (the signature) possibly empty.
const ACCESS_TOKEN_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;

// The refresh token: 32 random bytes in base64url, 43 characters. This is
// @nestjs/authentication's TOKEN_PATTERN (utils/crypto.util.js), which
// TokenService.refresh and revoke check too.
const REFRESH_TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

// Anything else counts as no cookie. A browser cookie can hold characters,
// such as CR, LF and NUL, that make Headers.set throw, so a token goes on to
// Nest only once it has the shape Nest issues.
function tokenValue(value: string | undefined, shape: RegExp): string | null {
  return value !== undefined && shape.test(value) ? value : null;
}

/**
 * Finishes every sign-in: saves Nest's token pair in the two cookies, and
 * returns where to send the member, which is `next` when it is a safe
 * same-origin path and "/" otherwise. `next` is `unknown` because it comes
 * from a form.
 */
export async function startSession(pair: TokenPair, next: unknown): Promise<string> {
  const cookieStore = await cookies();

  cookieStore.set(
    SESSION_COOKIE,
    pair.accessToken,
    cookieOptions(SESSION_COOKIE_PATH, sessionMaxAge(pair.expiresIn)),
  );
  cookieStore.set(
    REFRESH_COOKIE,
    pair.refreshToken,
    cookieOptions(REFRESH_COOKIE_PATH, REFRESH_MAX_AGE_SECONDS),
  );

  return safeNextPath(next);
}

/**
 * Tells the browser to drop both cookies. Each is cleared at its own path
 * with an empty value and `maxAge: 0`. `cookies().delete(name)` would only
 * clear a cookie at "/", and would leave the refresh cookie in place.
 */
export async function clearSessionCookies(): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE, "", cookieOptions(SESSION_COOKIE_PATH, 0));
  cookieStore.set(REFRESH_COOKIE, "", cookieOptions(REFRESH_COOKIE_PATH, 0));
}

/**
 * Reads both tokens from the request. A token that isn't shaped like the one
 * Nest issues is null, as if the cookie were missing. It only reads, so a Server Component
 * may call it, inside a `<Suspense>` boundary and never inside `'use cache'`.
 * The browser sends the refresh cookie only to paths under `/api/auth`, so
 * anywhere else `refreshToken` is null.
 */
export async function readSessionCookies(): Promise<SessionCookies> {
  const cookieStore = await cookies();

  return {
    accessToken: tokenValue(cookieStore.get(SESSION_COOKIE)?.value, ACCESS_TOKEN_SHAPE),
    refreshToken: tokenValue(cookieStore.get(REFRESH_COOKIE)?.value, REFRESH_TOKEN_SHAPE),
  };
}
