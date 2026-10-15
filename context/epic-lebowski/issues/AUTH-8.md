# AUTH-8: proxy.ts refresh and the Data Access Layer

Part of the Lebowski epic. See [index.md](../index.md). Realm: Auth. Phase 0. Blocked by: AUTH-7.

**Scope:** `proxy.ts` sends any navigation whose access token is about to expire through `/api/auth/refresh` and back. `lib/session.ts` is the one server-only place that reads the session and asks Nest who the member is.

## Gap

The access token lasts 15 minutes. After that every page would render as signed out, or every Server Component would have to refresh on its own and race the others. The refresh cookie is path-limited to `/api/auth`, so a page request cannot see it. The old plan expected a per-request middleware to refresh, which cannot read a path-limited cookie. This story fixes that with a redirect, and gives every page one cached way to ask "who is signed in".

## Scope

**`apps/web/src/proxy.ts`** (Node runtime):

- Matcher: every path except `/api/*`, `/_next/*`, static files and `/favicon.ico`, and with `missing: [{ type: "header", key: "next-router-prefetch" }]` so prefetches never reach proxy. Proxy cannot see `next-router-prefetch` itself: Next 16.4 strips it from `request.headers` (`proxy.md:472-486`). A Vitest spec pins the `missing` rule, because a matcher change can silently drop proxy coverage (`proxy.md:249-251`).
- For a GET, when the `__Host-session` cookie is present and its token is inside the refresh window or can't be read, redirect to `/api/auth/refresh?next=<path and query>`. This covers both a full page load and a client-side `<Link>` navigation, which is an RSC fetch with `Sec-Fetch-Dest: empty`. Next strips the RSC headers in proxy on purpose, so that RSC and HTML requests are treated the same (`proxy.md`, "RSC requests and rewrites"). Everything else passes through, including Server Action POSTs.
- **The refresh window** is `min(60, floor((exp - iat) / 2))` seconds before `exp`, or 60 when the token has no usable `iat`. A flat 60 seconds would loop for a token that lives 60 seconds or less. `JWT_EXPIRES_IN` must be 3 or more. When `safeNextPath` would refuse the path and query, `next` is the path alone, then none (so `/feed`).
- **No cookie means anonymous.** The request passes through, and the page renders signed out. Proxy can't see the refresh cookie, so it can't tell a visitor apart from a member by that. That is why `__Host-session` now lives as long as the refresh cookie (below).
- A spike proves the client-side navigation path in Chromium and WebKit before proxy is built. If it fails, proxy keeps a document-only rule (`Sec-Fetch-Dest: document`), and `requireSession` redirects to `/api/auth/refresh?next=` instead of `/login`.
- A prefetch never reaches proxy. A session page's prefetch stops at `io()` inside `verifySession`, so it holds no session output, and the click goes through proxy and refreshes. Only a page that reads no session is served whole from the prefetch.
- `exp` is read by decoding the JWT payload locally, with no signature check. Nest checks the signature.

**`apps/web/src/app/api/auth/refresh/route.ts`**, `GET`:

- Needs `__Host-session` first, present and non-empty. Without it the request didn't come from proxy, and a sibling subdomain may have planted the refresh cookie. `clearSessionCookies()`, then redirect to `/login?next=`, with no Nest call.
- A request that carries `__Secure-refresh` twice is refused the same way (a planted copy can come last): GET clears both cookies and redirects to `/login?next=`, POST answers 401, and Nest is not called. One helper, `hasDuplicateRefreshCookie(request)` in `lib/session.ts`, reads the raw `Cookie` header and makes the check for refresh and both sign-out routes.
- Reads the `__Secure-refresh` cookie (`REFRESH_COOKIE` in `lib/session.ts`). None: `clearSessionCookies()`, then redirect to `/login?next=`.
- Ties the refresh token to the session cookie's sign-in (SEC-6). The old `__Host-session` token must carry a `sid`, or Nest isn't called. The fresh access token must carry the same `sid` (`sameSignIn` in `lib/access-token.ts`), or nothing is saved and the request counts as signed out. A held pair is keyed by the refresh token alone, so every request is checked against its own session cookie. A malformed session cookie with a live refresh cookie now lands signed out.
- Calls Nest `POST /auth/token/refresh` with `{ refreshToken }`. Sets both cookies from the answer with `startSession(pair, next, "/feed")` and redirects to the path it returns. `startSession` runs `safeNextPath()` from AUTH-7's `lib/next-path.ts`, so only same-origin paths pass. Here, an unsafe or missing `next` lands on `/feed`, not `/`.
- To make that work, AUTH-8 adds an optional fallback argument to `safeNextPath(value, fallback = "/")` in `lib/next-path.ts`. Every other caller keeps `/`. `startSession` gains the same optional argument to hand `/feed` through.
- Reuse `logFailure()` from AUTH-7's `lib/route-responses.ts` for the log line. For the redirect, reuse `seeOther(path)` from the same file. It sends a 303 to `safeNextPath(path)`. The `POST` method calls `assertSameOrigin()` from `lib/origin.ts`. The `GET` is a navigation and needs no Origin check.
- AUTH-7's sign-in step calls Nest `POST /auth/sign-out` with the old access cookie, so signing in again ends the previous sign-in. That works only while the old access token is valid (15 minutes). Proxy refreshes before `/login` renders, so the access cookie is fresh when it's needed.
- On 401 "Refresh token invalid", "expired" or "reused", or a `sid` mismatch: calls `clearSessionCookies()` (AUTH-7), which clears each cookie at its own path, then redirects to `/login?next=`. When the safe `next` is `/login` or `/signup`, the redirect is plain `/login`.
- **Nest down.** On a 5xx, a 429 or no answer: log with `logFailure()`, clear `__Host-session` only, keep `__Secure-refresh` (it wasn't spent), and redirect to `next`. The page renders signed out, or `requireSession` sends to `/login`. A plain redirect back with the old cookies would loop through proxy.
- **Single flight per instance:** a module-level `Map<string, Promise<TokenPair>>` keyed by the SHA-256 of the refresh token. A second request with the same token waits for the first promise instead of calling Nest again. A settled pair stays in the Map for 10 seconds, so a request that arrives just after the first one finished, still carrying the old cookie, gets the same pair. A failure is deleted at once.
- Every answer says `Cache-Control: no-store`.
- `POST` on the same handler serves the browser's fetch wrapper (below). Like GET, it needs `__Host-session` and refuses a duplicate refresh cookie, so a planted refresh cookie can't sign a visitor in to the attacker's account through `clientFetch`. It answers 204 on success, 401 when there's no session cookie, no refresh cookie, a duplicate refresh cookie, a missing `sid` or a pair from another sign-in, or Nest answers 401, and 503 when Nest is down.

**`apps/web/src/lib/session.ts`**, starting with `import "server-only"`. AUTH-7 already built the cookie half of this file: `SESSION_COOKIE` (`__Host-session`), `REFRESH_COOKIE` (`__Secure-refresh`), `REFRESH_COOKIE_PATH`, `REFRESH_MAX_AGE_SECONDS`, `startSession`, `clearSessionCookies` and `readSessionCookies`. This story changes and adds:

- `__Host-session` gets `maxAge: REFRESH_MAX_AGE_SECONDS` (7 days), not `expiresIn`. The access token inside still expires after 15 minutes. The cookie stays so that proxy can tell a member whose token ran out from an anonymous visitor.
- `verifySession = cache(async (): Promise<{ accessToken: string; exp: number } | null> => ...)` reads `__Host-session` through `cookies()` and decodes `exp`. A missing, malformed or expired token gives null. No network call.
- `getMe = cache(async (): Promise<UserResponse | null> => ...)` calls Nest `GET /users/me` once per request with the bearer token. The role comes from here, never from the token: the token carries no role on purpose.
- `requireSession(next: string)` redirects to `/login?next=` when `verifySession()` is null.
- The `exp` decoding lives in a pure `lib/access-token.ts`, shared by `proxy.ts` and `session.ts`. The current time comes from `@northguild/gmt`.
- `SessionCorner` (AUTH-7) switches from `readSessionCookies` to `verifySession`, because a present cookie no longer means a live token.

**`apps/web/src/app/api/bff/[...path]/route.ts`**: `GET`, `POST`, `PATCH`, `DELETE`. Re-checks the session with `verifySession()`, and answers 401 with no Nest call when it is null. Forwards the request to `${API_URL}/<path>` with the bearer token, and streams the answer back. It never refreshes.

- **Allow-list.** `abidings`, `hashtags`, `profiles` and `users/me`, matched segment by segment, so `users/me-x` and `users/1` answer 404. Later stories add their prefixes. LANE-25 adds `lanes`, because Nest has no lanes controller until then.
- **Path tricks.** Any `.`, `..` or empty segment, and a segment holding an encoded slash, a `%` or a backslash, answers 404 before the allow-list check.
- **Origin.** `POST`, `PATCH` and `DELETE` call `assertSameOrigin()` and answer 403 on a mismatch.
- **Headers.** Only the method, the query string, `Content-Type` and the body go to Nest. The browser's Cookie, Authorization and hop-by-hop headers never do. Only the status, `Content-Type`, `Retry-After` and the body come back, with `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.
- **`X-Bff-Secret` and `X-Client-Ip`** wait for API-10, which sends them on every BFF call, `/api/bff` included.

**`apps/web/src/lib/client-fetch.ts`** (browser): `clientFetch(path, init)` calls `/api/bff/...`. On a 401 it calls `POST /api/auth/refresh` once, through one shared promise for the whole tab, and retries once. A second 401 sends the browser to `/login?next=`. A 503 from refresh hands the caller the original 401, with no redirect. After the Nest-down path the session cookie is gone, so refresh answers 401 and a `clientFetch` 401 goes to `/login`. A reload also recovers. This is part of the accepted QA-4 limit.

**Placeholder `/feed`.** FEED-13 builds `/feed`, and it waits on this story. AUTH-8 builds a minimal `apps/web/src/app/(app)/feed/page.tsx`: a static shell with the heading "Feed", and a Suspense hole that calls `requireSession("/feed")` and `getMe()` and shows "Signed in as {display name}." When Nest answers 401 (`getMe()` is null), it goes to `/login?next=%2Ffeed`. FEED-13 replaces the body.

**Sign-out and the refresh cookie.** AUTH-8 changes AUTH-7's two sign-out routes, for every sign-out and not only one with a duplicate cookie. A sibling subdomain can plant a `__Secure-` refresh cookie, but never `__Host-session`. So a refresh token goes to Nest only when it can be tied to the session cookie's sign-in: it is sent once, the session token has a `sid`, and a fresh pair has the same `sid`. "Sign out" uses the access token first, through `POST /auth/sign-out`, which ends the whole sign-in, refresh family included, so `/auth/token/revoke` is no longer called. Only when Nest answers 401 to that token does it fall back to a `sid`-checked refresh, and only with one refresh cookie. "Sign out everywhere" makes no refresh call without a usable access token, and checks the `sid` after a refresh. On a mismatch it lands on partial and revokes nothing. "Sign out everywhere" never calls `/auth/token/revoke`. After a failure its fallback is a tied `POST /auth/sign-out`, with the newest access token that matches this sign-in and that Nest didn't refuse, and never after a 401. Any failure lands on `/?signout=partial`. With the refresh cookie sent twice, both routes use the access token alone: `/` on success, `/?signout=partial` otherwise.

**`apps/web/src/components/SiteHeader`** (user request, scaffolding until WORLD-48): a banner in the root layout, before `<main>`, with "Dudesphere" linking to `/`. It is static and reads no request data, so every page keeps its static shell. It has a marked place for FEED-12's `WhoIsSignedIn`.

**`next` on `/login` is already honoured.** AUTH-7's `NextPathField` reads `?next=` into a hidden input, and `signIn` lands there through `startSession`. This story adds no work on the login page.

**JavaScript off.** With `cacheComponents` on, a JavaScript-off Server Action POST that doesn't redirect returns no HTML shell, so an error shows a blank page. The 303 success path works. This does not touch the refresh handler, which only redirects. See "Known limit" in `rendering-strategies.md`.

## Design notes

- **Redirect-to-refresh fixes the old plan's flaw.** Only the refresh handler sees the refresh cookie, and only the refresh handler swaps it.
- **No loops.** Proxy redirects only when a session cookie is present. Every refresh failure clears `__Host-session`, so the next request passes through as anonymous. This holds only while the browser accepts the cookie writes. A browser that refuses them stops after 16 to 20 redirects. The handler can't tell it from a second tab that lost the race, and the only stateless breaker is a marker in the URL. Accepted (QA-2).
- **A refresh token works once.** Nest ends the whole sign-in if one is used twice, and has no grace period. Single flight on the server, with its 10-second hold, and in the browser stops two tabs or two requests from both refreshing. The hold has a cost: someone who stole the old refresh token and replays it on the same instance within those 10 seconds gets the new pair. Accepted.
- **Two instances can still race.** On Vercel two instances may each refresh the same token. The loser gets 401 "reused", and the member signs in again. Accepted for the MVP; LANE-49 or a later story can move single flight to a shared store if it shows up in logs.
- **`requireSession` and `verifySession` authorize nothing.** They read the cookie, so a forged or ended token passes. Only data fetched from Nest with the Bearer is protected (SEC-2).
- **Accepted limit (QA-4).** After the Nest-down path, the kept refresh cookie is never used or revoked, so the old sign-in stays live at Nest until it expires, up to 7 days.
- **Accepted limit (SEC-3).** Until API-10, Nest counts every BFF call under the Next server's address, so one visitor can use up the shared rate-limit bucket.
- **Layouts never check auth.** Pages call `requireSession()` or `getMe()`. Every Server Action and Route Handler re-checks. Proxy is an optimistic step only.
- **With Cache Components, `cookies()` is read only inside Suspense and never inside `'use cache'`.** `verifySession` and `getMe` are called from components that sit under a Suspense boundary.
- **`cache()` dedupes per request.** Five components that ask `getMe()` make one call to Nest. It does not dedupe outside a server render, so Vitest can't prove it. The Verification line counts Nest calls in the log.
- **`cookies().delete(name)` clears only path `/`.** That holds for the name-only form. `delete` also takes an options object with `path`, so `clearSessionCookies` could clear `__Secure-refresh` at `/api/auth` that way. `session.ts`, `frontend-architecture.md` and this spec say so precisely.

## Rendering strategy

`proxy.ts` is the lesson's request interception row: it runs before routing, on the Node runtime, and `middleware.ts` is named as deprecated (renamed `proxy.ts`). Proxy runs on Node only, and the Edge runtime isn't supported there. The Data Access Layer teaches React's `cache()` for per-request deduplication and the `server-only` package as a build-time guard. The placeholder `/feed` is a static shell with one streaming hole.

## Verification

- With `JWT_EXPIRES_IN=60` in `apps/api/.env` (it must be 3 or more), sign in, wait 61 seconds, open `/feed`: the network panel shows one redirect through `/api/auth/refresh` and the page renders signed in.
- The same after a client-side `<Link>` navigation.
- An anonymous visitor on `/`, `/login` or `/feed` never goes through `/api/auth/refresh`. `/feed` sends them to `/login?next=%2Ffeed`.
- Two tabs reload at the same moment after expiry: Nest sees one refresh call per instance, and both tabs stay signed in. The same holds when the second tab is a moment later, within 10 seconds.
- A single planted refresh cookie, with the member's own session cookie, lands the member signed out and never in another account.
- Replay an old refresh token by hand: Nest answers "reused", both cookies are cleared, and the browser lands on `/login?next=`.
- With Nest stopped, an expired session renders the page signed out, and `__Secure-refresh` survives.
- A hovered link prefetch with a dead session makes no refresh call.
- `next=https://evil.example.com` on the refresh handler redirects to `/feed`, and so does a request with no `next`.
- The matcher keeps prefetches out of proxy: a `<Link>` hover with a dead session never reaches `proxy.ts`. A document request does.
- Signing in again after the access token expired ends the previous sign-in at Nest: its tokens get 401.
- Importing `lib/session.ts` from a Client Component fails the build.
- `GET /api/bff/users/1` (outside the allow-list) answers 404. A cross-origin `POST /api/bff/abidings` answers 403.
- A page that calls `getMe()` three times makes one Nest call (log count).

## Done when

- [ ] `proxy.ts` with the prefetch and expiry rules, after the navigation spike
- [ ] `api/auth/refresh` with single flight, the 10-second hold, the 401 path and the Nest-down path
- [ ] `lib/session.ts` with the 7-day session cookie, `verifySession`, `getMe` and `requireSession`
- [ ] `api/bff/[...path]` with the allow-list, the path checks, the Origin check on writes and the header rules
- [ ] `lib/client-fetch.ts` with one shared refresh promise
- [ ] `SessionCorner` on `verifySession`, and the placeholder `/feed`
- [ ] One `hasDuplicateRefreshCookie` helper, used by refresh and both sign-out routes
- [ ] `SiteHeader` in the root layout
- [ ] Vitest specs for the expiry decision, single flight and the `next` check, and Playwright specs for the refresh flows
- [ ] Row added to `rendering-strategies.md`
