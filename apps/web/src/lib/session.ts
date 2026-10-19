import "server-only";
import type { TokenPair, UserResponse } from "@dudesphere/api-types";
import { io } from "next/cache";
import { cookies } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { cache } from "react";

import { expiresWithin, readTokenExp } from "@/lib/access-token";
import { apiFetch, ApiRequestError } from "@/lib/api";
import { loginHref, safeNextPath } from "@/lib/next-path";
import { logFailure } from "@/lib/route-responses";

// The one place that knows the sign-in cookies: their names, options and
// lifetimes. Server Actions and Route Handlers call it; page scripts never see
// a token, because both cookies are httpOnly.
//
// It is also the Data Access Layer: verifySession, getMe, requireSession and
// requireAdmin are how every page, Server Action and Route Handler asks who is signed in.
// Layouts never ask. Proxy's check is only an optimistic first step.
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
 * Finishes every sign-in and every refresh: saves Nest's token pair in the
 * two cookies, and returns where to send the member. That is `next` when it
 * is a safe same-origin path, and `fallback` ("/" unless the caller names
 * another) otherwise. `next` is `unknown` because it comes from a form or a
 * query string.
 *
 * Both cookies live 7 days. The access token inside the session cookie still
 * expires when Nest says, after 15 minutes. The cookie outlives it so that
 * proxy can tell a member whose token ran out, who has a cookie, from an
 * anonymous visitor, who has none. Proxy can't see the refresh cookie, which
 * travels only to `/api/auth`.
 */
export async function startSession(
  pair: TokenPair,
  next: unknown,
  fallback?: string,
): Promise<string> {
  const cookieStore = await cookies();

  cookieStore.set(
    SESSION_COOKIE,
    pair.accessToken,
    cookieOptions(SESSION_COOKIE_PATH, REFRESH_MAX_AGE_SECONDS),
  );
  cookieStore.set(
    REFRESH_COOKIE,
    pair.refreshToken,
    cookieOptions(REFRESH_COOKIE_PATH, REFRESH_MAX_AGE_SECONDS),
  );

  return safeNextPath(next, fallback);
}

/**
 * Tells the browser to drop both cookies. Each is cleared at its own path
 * with an empty value and `maxAge: 0`. The name-only `cookies().delete(name)`
 * clears only the cookie at "/", so it would leave the refresh cookie in
 * place. `delete({ name, path })` can clear another path; setting `maxAge: 0`
 * does the same and keeps every write in one shape.
 */
export async function clearSessionCookies(): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE, "", cookieOptions(SESSION_COOKIE_PATH, 0));
  cookieStore.set(REFRESH_COOKIE, "", cookieOptions(REFRESH_COOKIE_PATH, 0));
}

/**
 * Ends the sign-in already in this browser's cookies, if there is one, so
 * new cookies, or none, don't hide a sign-in that Sign out could then never
 * reach. signIn and signUp call it once the new pair is in hand (QA-2), and
 * resetPassword once Nest has taken the new password (SEC-3). So a failed
 * attempt never signs the member out of the sign-in they have.
 *
 * Only the access token can do this: the refresh cookie is sent to
 * /api/auth paths only, so a Server Action never sees it. Nest ends the
 * token's sign-in and its whole refresh family. Any answer from Nest that
 * isn't a success, or none at all, is logged by method, path and status
 * (logFailure, never a token), and the caller goes on: a 401 means there was
 * nothing left to end. A plain Error, such as API_URL unset, is a bug in the
 * app and is thrown again. It writes no cookie.
 *
 * It lives here, not in a 'use server' file, because every async function a
 * 'use server' file exports becomes a Server Action anyone can call.
 */
export async function endOldSignIn(label: string): Promise<void> {
  const { accessToken } = await readSessionCookies();
  if (!accessToken) return;

  try {
    await apiFetch<void>("/auth/sign-out", { method: "POST", token: accessToken });
  } catch (error) {
    if (!(error instanceof ApiRequestError)) throw error;
    logFailure(label, error);
  }
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

/**
 * True when the request's Cookie header holds `__Secure-refresh` more than
 * once. Then neither value can be trusted, and no route under `/api/auth`
 * may send either one to Nest.
 *
 * Why it happens: `__Secure-` allows a Domain attribute (`__Host-` doesn't),
 * so a sibling subdomain can plant its own refresh cookie for the parent
 * domain at path `/api/auth`. The browser then sends both. The planted one
 * comes last (same path, newer), and Next's cookie store keeps only the
 * last value, so readSessionCookies would hand back the attacker's token.
 * This app can't clear the planted cookie: that takes a Set-Cookie with the
 * attacker's Domain. It can refuse to use it.
 *
 * It reads the raw header, because the cookie store can't show a duplicate.
 * Entries are split on ";", and each name is the text before its first "=",
 * trimmed, matched exactly and with case. A name that only contains
 * `__Secure-refresh`, a value that holds it, or an entry with no "=" (a
 * cookie with an empty name) doesn't count.
 */
export function hasDuplicateRefreshCookie(request: Request): boolean {
  return countCookies(request.headers.get("cookie") ?? "", REFRESH_COOKIE) > 1;
}

function countCookies(header: string, name: string): number {
  return header.split(";").filter((entry) => {
    const equals = entry.indexOf("=");
    return equals !== -1 && entry.slice(0, equals).trim() === name;
  }).length;
}

/** A live session: the access token and when it runs out, in epoch seconds. */
export interface VerifiedSession {
  accessToken: string;
  exp: number;
}

/**
 * The session in the request's cookies, or null when the access token is
 * missing, malformed or already expired. It reads the token's `exp` without
 * checking the signature and makes no network call; Nest checks the
 * signature when the token is used.
 *
 * It gives no grace the other way: a token is good here until it has
 * actually expired. Refreshing early is proxy's job.
 *
 * It authorizes nothing. A non-null answer means only that the cookie holds
 * a JWT-shaped token whose unchecked `exp` hasn't passed. A forged token, or
 * one Nest has revoked at sign-out, passes here too. Use it to choose what
 * to try, such as which links to show, never to decide who may see what.
 * Only data fetched from Nest with the Bearer is protected, because Nest
 * checks the signature and the sign-in on every call.
 *
 * React's cache() runs it once per server render. It reads cookies(), so
 * call it inside a `<Suspense>` boundary and never inside `'use cache'`.
 *
 * It awaits io() before it reads the clock. When Next renders a page's shell
 * ahead of a navigation, cookies() can resolve, but reading the current time
 * there is an error under Cache Components (Next logs "encountered the
 * unstable value"). io() stops that render before the clock, and resolves at
 * once on a real request, in a Route Handler and in a Server Action. The Next
 * docs (functions/io.md) prefer it to connection(). With no token there is no
 * clock to read, so an anonymous visitor still renders signed out in the
 * shell.
 */
export const verifySession = cache(async function verifySession(): Promise<VerifiedSession | null> {
  const { accessToken } = await readSessionCookies();
  if (accessToken === null) {
    return null;
  }

  const exp = readTokenExp(accessToken);
  if (exp === null) {
    return null;
  }

  await io();
  if (expiresWithin(exp, 0)) {
    return null;
  }

  return { accessToken, exp };
});

/**
 * The signed-in member, from Nest's GET /users/me, or null when there is no
 * live session or Nest answers 401. Any other failure is thrown, so a page's
 * error boundary shows it rather than the page passing it off as signed out.
 *
 * The role comes from here, never from the token, which carries none on
 * purpose. React's cache() makes it one call to Nest per server render, however
 * many components ask.
 */
export const getMe = cache(async function getMe(): Promise<UserResponse | null> {
  const session = await verifySession();
  if (session === null) {
    return null;
  }

  try {
    return await apiFetch<UserResponse>("/users/me", { token: session.accessToken });
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) {
      return null;
    }
    throw error;
  }
});

/**
 * The live session, or a redirect to sign-in that brings the member back to
 * `next`. redirect() throws, so nothing after a failed check runs.
 *
 * It is not an authorization gate. It calls verifySession, which reads the
 * token's `exp` without checking the signature or asking Nest, so a forged
 * or revoked token gets past it. It only sends a visitor with no live-looking
 * token to sign-in before the page does any work. Anything that must not be
 * public has to come from Nest, fetched with the Bearer (getMe, for one), and
 * the page must render it only when Nest answered. Never render private
 * content just because requireSession returned.
 */
export async function requireSession(next: string): Promise<VerifiedSession> {
  const session = await verifySession();
  if (session === null) {
    redirect(loginHref(next));
  }
  return session;
}

/**
 * The signed-in member when their role is `admin`. With no live session, or
 * when Nest answers 401, it redirects to sign-in with `next`, as
 * requireSession does. Any other role calls forbidden(), which renders the
 * nearest forbidden.tsx. Both throw, so nothing after a failed check runs.
 * Any other failure from getMe is thrown as it came.
 *
 * The role comes from Nest's GET /users/me through getMe, never from the
 * token, which carries none. So unlike requireSession it is an authorization
 * gate for what HTML the page sends. Nest still guards every piece of data.
 *
 * forbidden() needs `experimental.authInterrupts` in next.config.ts. Call
 * requireAdmin in the render path and await it: a try/catch around it, or a
 * promise left unawaited, swallows the redirect and the forbidden page.
 */
export async function requireAdmin(next: string): Promise<UserResponse> {
  const me = await getMe();
  if (me === null) {
    redirect(loginHref(next));
  }
  if (me.role !== "admin") {
    forbidden();
  }
  return me;
}
