# AUTH-8: proxy.ts refresh and the Data Access Layer

Part of the Lebowski epic. See [index.md](../index.md). Realm: Auth. Phase 0. Blocked by: AUTH-7.

**Scope:** `proxy.ts` sends a document navigation with a missing or nearly expired access token through `/api/auth/refresh` and back, and `lib/session.ts` is the one server-only place that reads the session and asks Nest who the member is.

## Gap

The access token lasts 15 minutes. After that every page would render as signed out, or every Server Component would have to refresh on its own and race the others. The refresh cookie is path-limited to `/api/auth`, so a page request cannot see it. The old plan expected a per-request middleware to refresh, which cannot read a path-limited cookie. This story fixes that with a redirect, and gives every page one cached way to ask "who is signed in".

## Scope

**`apps/web/src/proxy.ts`** (Node runtime):

- Matcher: every path except `/api/*`, `/_next/*`, static files and `/favicon.ico`, and with `missing: [{ type: "header", key: "next-router-prefetch" }]` so prefetches never reach proxy. Proxy cannot see `next-router-prefetch` itself: Next 16.4 strips it from `request.headers` (`proxy.md:472-486`). A Vitest spec pins the `missing` rule, because a matcher change can silently drop proxy coverage (`proxy.md:249-251`).
- If the request's `Sec-Fetch-Dest` is `document`, and the `__Host-session` cookie is missing or its `exp` is within 60 seconds, redirect to `/api/auth/refresh?next=<path and query>`. Any other `Sec-Fetch-Dest` passes through.
- Prefetches with a dead session pass through and render as anonymous.
- `exp` is read by decoding the JWT payload locally, with no signature check. Nest checks the signature.

**`apps/web/src/app/api/auth/refresh/route.ts`**, `GET`:

- Reads the `__Secure-refresh` cookie (`REFRESH_COOKIE` in `lib/session.ts`). None: redirect to `/login?next=`.
- Calls Nest `POST /auth/token/refresh` with `{ refreshToken }`. Sets both cookies from the answer with `startSession(pair, next)` and redirects to the path it returns. `startSession` runs `safeNextPath()` from AUTH-7's `lib/next-path.ts`, so only same-origin paths pass. Here, an unsafe or missing `next` lands on `/feed`, not `/`.
- To make that work, AUTH-8 adds an optional fallback argument to `safeNextPath(value, fallback = "/")` in `lib/next-path.ts`. Every other caller keeps `/`. `startSession` passes `safeNextPath(next)` with no fallback today, so it needs the same optional argument to hand `/feed` through.
- Reuse `logFailure()` from AUTH-7's `lib/route-responses.ts` for the log line. For the redirect, reuse `seeOther(path)` from the same file. It sends a 303 to `safeNextPath(path)`. The `POST` form calls `assertSameOrigin()` from `lib/origin.ts`. The `GET` is a navigation and needs no Origin check.
- AUTH-7's sign-in step calls Nest `POST /auth/sign-out` with the old access cookie, so signing in again ends the previous sign-in. That works only while the old access token is valid (15 minutes). The fresh access cookie that AUTH-8 keeps in place is what makes it reliable.
- On 401 "Refresh token invalid", "expired" or "reused": calls `clearSessionCookies()` (AUTH-7), which clears each cookie at its own path, then redirects to `/login?next=`.
- **Single flight per instance:** a module-level `Map<string, Promise<TokenPair>>` keyed by the SHA-256 of the refresh token. A second request with the same token waits for the first promise instead of calling Nest again. The entry is deleted when the promise settles.
- `POST` on the same handler serves the browser's fetch wrapper (below) and answers 204 or 401.

**`apps/web/src/lib/session.ts`**, starting with `import "server-only"`. AUTH-7 already built the cookie half of this file: `SESSION_COOKIE` (`__Host-session`), `REFRESH_COOKIE` (`__Secure-refresh`), `REFRESH_COOKIE_PATH`, `REFRESH_MAX_AGE_SECONDS`, `startSession`, `clearSessionCookies` and `readSessionCookies`. This story adds:

- `verifySession = cache(async (): Promise<{ accessToken: string; exp: number } | null> => ...)` reads `__Host-session` through `cookies()` and decodes `exp`. No network call.
- `getMe = cache(async (): Promise<UserResponse | null> => ...)` calls Nest `GET /users/me` once per request with the bearer token. The role comes from here, never from the token: the token carries no role on purpose.
- `requireSession(next: string)` redirects to `/login?next=` when `verifySession()` is null.

**`apps/web/src/app/api/bff/[...path]/route.ts`**: `GET`, `POST`, `PATCH`, `DELETE`. Re-checks the session, forwards the request to `${API_URL}/<path>` with the bearer token, the `X-Bff-Secret` and `X-Client-Ip` headers, and streams the answer back. It never refreshes. An allow-list of path prefixes (`abidings`, `hashtags`, `profiles`, `users/me`, `lanes`, and later ones) stops it from being an open proxy.

**`apps/web/src/lib/client-fetch.ts`** (browser): `clientFetch(path, init)` calls `/api/bff/...`. On a 401 it calls `POST /api/auth/refresh` once, through one shared promise for the whole tab, and retries once. A second 401 sends the browser to `/login?next=`.

**`next` on `/login` is already honoured.** AUTH-7's `NextPathField` reads `?next=` into a hidden input, and `signIn` lands there through `startSession`. This story adds no work on the login page.

**JavaScript off.** With `cacheComponents` on, a JavaScript-off Server Action POST that doesn't redirect returns no HTML shell, so an error shows a blank page. The 303 success path works. This does not touch the refresh handler, which only redirects. See "Known limit" in `rendering-strategies.md`.

## Design notes

- **Redirect-to-refresh fixes the old plan's flaw.** Only the refresh handler sees the refresh cookie, and only the refresh handler swaps it.
- **A refresh token works once.** Nest ends the whole sign-in if one is used twice. Single flight on the server and in the browser stops two tabs or two requests from both refreshing.
- **Two instances can still race.** On Vercel two instances may each refresh the same token. The loser gets 401 "reused", and the member signs in again. Accepted for the MVP; LANE-49 or a later story can move single flight to a shared store if it shows up in logs.
- **Layouts never check auth.** Pages call `requireSession()` or `getMe()`. Every Server Action and Route Handler re-checks.
- **With Cache Components, `cookies()` is read only inside Suspense and never inside `'use cache'`.** `verifySession` and `getMe` are called from components that sit under a Suspense boundary.
- **`cache()` dedupes per request.** Five components that ask `getMe()` make one call to Nest.

## Rendering strategy

`proxy.ts` is the lesson's request interception row: it runs before routing, on the Node runtime, and `middleware.ts` and the Edge runtime are named as deprecated and not used. The Data Access Layer teaches React's `cache()` for per-request deduplication and the `server-only` package as a build-time guard.

## Verification

- With `JWT_EXPIRES_IN=60` in `apps/api/.env`, sign in, wait 61 seconds, open `/feed`: the network panel shows one redirect through `/api/auth/refresh` and the page renders signed in.
- Two tabs reload at the same moment after expiry: Nest sees one refresh call per instance, and both tabs stay signed in.
- Replay an old refresh token by hand: Nest answers "reused", both cookies are cleared, and the browser lands on `/login?next=`.
- A hovered link prefetch with a dead session makes no refresh call.
- `next=https://evil.example.com` on the refresh handler redirects to `/feed`, and so does a request with no `next`.
- The matcher keeps prefetches out of proxy: a `<Link>` hover with a dead session never reaches `proxy.ts`. A document request with `Sec-Fetch-Dest: document` does.
- Importing `lib/session.ts` from a Client Component fails the build.
- `GET /api/bff/users/1` (outside the allow-list) answers 404.
- A page that calls `getMe()` three times makes one Nest call (log count).

## Done when

- [ ] `proxy.ts` with the prefetch and expiry rules
- [ ] `api/auth/refresh` with single flight and the 401 path
- [ ] `lib/session.ts` with `verifySession`, `getMe` and `requireSession`
- [ ] `api/bff/[...path]` with the allow-list
- [ ] `lib/client-fetch.ts` with one shared refresh promise
- [ ] Vitest specs for the expiry decision, single flight and the `next` check
- [ ] Row added to `rendering-strategies.md`
