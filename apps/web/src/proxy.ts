import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { expiresWithin, readTokenTimes } from "@/lib/access-token";
import type { TokenTimes } from "@/lib/access-token";
import { safeNextPath } from "@/lib/next-path";

// Refreshes a member's session before a page renders, so they stay signed in
// past the 15-minute access token.
//
// Proxy is an optimistic step only. It reads the token's `exp` without
// checking the signature, so a forged `exp` gets past it and then fails at
// Nest. It never decides who may see what: every Route Handler, Server Action
// and page re-checks the session itself (verifySession and requireSession in
// lib/session.ts).
//
// The rule, for a GET only:
// - No session cookie, or an empty one: an anonymous visitor. Pass through.
//   Redirecting them would loop through refresh and /login.
// - A cookie whose token is outside the refresh window: pass through.
// - A cookie whose token is inside the window, already expired, or
//   unreadable: 307 to /api/auth/refresh?next=<path and query>. The refresh
//   handler clears the cookie when it can't refresh, so nothing loops while
//   the browser accepts the cookie writes (see "Refresh" in
//   context/frontend-architecture.md).
//
// The window is 60 seconds, or half the token's own life (`exp - iat`) when
// that is shorter. A token Nest has just issued is never inside it, so the
// refresh handler's 303 back to the page always passes through. With a flat
// 60 seconds, a token that lives 60 seconds or less would be sent straight
// back to refresh, again and again, until the browser gave up. A token with
// no usable `iat` gets the full 60 seconds: Nest always writes `iat`, so
// only a token Nest didn't issue lacks one, and Nest refuses it anyway.
//
// The cap holds while the web server's clock and Nest's agree to within
// half the token's life: 30 seconds for a 60-second token. A token that
// lives 2 seconds or less can still loop when the second ticks over between
// Nest issuing it and proxy reading it, so JWT_EXPIRES_IN must be 3 or more.
//
// Any GET counts, not only documents. A client-side <Link> navigation is an
// RSC fetch, and the AUTH-8 Task 1 spike proved that the router follows the
// 307 and the handler's 303, stores the new cookie and renders the page
// client-side. HEAD, POST (Server Actions) and every other method pass
// through: a Server Action re-checks the session itself.
//
// No `runtime` export: proxy runs on Node, and setting `runtime` here throws.

// The same name as SESSION_COOKIE in lib/session.ts. It is copied, not
// imported, because lib/session.ts imports server-only, next/headers and the
// API client, and proxy should load none of that (proxy.md: don't rely on
// shared modules here). proxy.spec.ts fails if the two names differ.
const SESSION_COOKIE = "__Host-session";

// The longest refresh window: refresh when the access token has this many
// seconds or fewer left, unless half its life is shorter.
const MAX_REFRESH_WINDOW_SECONDS = 60;

const REFRESH_PATH = "/api/auth/refresh";

/**
 * How many seconds before `exp` to refresh: min(60, floor((exp - iat) / 2)),
 * or 60 when the token has no usable `iat`. Never below 0, because
 * readTokenTimes gives an `iat` only when it is before `exp`.
 */
function refreshWindowSeconds({ exp, iat }: TokenTimes): number {
  if (iat === null) {
    return MAX_REFRESH_WINDOW_SECONDS;
  }
  return Math.min(MAX_REFRESH_WINDOW_SECONDS, Math.floor((exp - iat) / 2));
}

/**
 * True when the session token is inside its refresh window, already expired,
 * or can't be read.
 */
function needsRefresh(token: string): boolean {
  const times = readTokenTimes(token);
  return times === null || expiresWithin(times.exp, refreshWindowSeconds(times));
}

/**
 * The `next` to hand the refresh handler: the page's path and query when
 * safeNextPath keeps them as they are, else the path alone, else null. The
 * handler sends a `next` that safeNextPath refuses to /feed, so a query over
 * its 2048-character limit would lose the page too. With null, the handler
 * lands on /feed.
 */
function nextPathFor(pathname: string, search: string): string | null {
  const pathAndQuery = `${pathname}${search}`;
  if (safeNextPath(pathAndQuery) === pathAndQuery) {
    return pathAndQuery;
  }
  if (safeNextPath(pathname) === pathname) {
    return pathname;
  }
  return null;
}

/**
 * Sends a GET whose session is about to run out through the refresh handler,
 * and lets every other request through.
 */
export function proxy(request: NextRequest): NextResponse {
  if (request.method !== "GET") {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token || !needsRefresh(token)) {
    return NextResponse.next();
  }

  // Next strips its internal `_rsc` query from nextUrl, so this is only the
  // page's own path and query (proved in the Task 1 spike).
  const next = nextPathFor(request.nextUrl.pathname, request.nextUrl.search);
  const target = new URL(REFRESH_PATH, request.url);
  if (next !== null) {
    target.searchParams.set("next", next);
  }
  return NextResponse.redirect(target, 307);
}

// Next reads this object at build time, so every value must be a literal.
//
// The source skips /api (the refresh handler and the BFF live there),
// _next/static, _next/image, favicon.ico and files with a static asset
// extension. It lists the extensions rather than skipping any path with a dot,
// because usernames may hold a dot (a future /u/john.doe must still reach
// proxy) and Next's own .rsc transport paths must too.
//
// The `missing` rule keeps link prefetches out, so a hovered link never
// starts a refresh. It relies on every prefetch sending next-router-prefetch.
// That holds while partialPrefetching is on in next.config.ts: auto
// prefetches send 1 or 3, and <Link prefetch={true}> sends 2. A Full prefetch
// sends no such header, so it would reach proxy and could start a refresh.
//
// proxy.md warns that a matcher change silently drops coverage, so
// proxy.spec.ts pins this object word for word.
export const config = {
  matcher: [
    {
      source:
        "/((?!api(?:/|$)|_next/static/|_next/image(?:/|$)|favicon\\.ico$|.*\\.(?:avif|css|gif|ico|jpe?g|js|map|png|svg|ttf|otf|txt|webmanifest|webp|woff2?|xml)$).*)",
      missing: [{ type: "header", key: "next-router-prefetch" }],
    },
  ],
};
