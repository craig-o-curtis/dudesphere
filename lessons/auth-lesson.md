# Auth: the lessons

This file teaches authentication (proving who the member is) and authorization (deciding what a known member may do) in Dudesphere: the NestJS API in `apps/api` and the Next.js app in `apps/web`. Each entry comes from one story, in the order the stories were built, so the file reads as a course from top to bottom. Every step names the file and the function to open. The API's own study notes are [TOKENS_AND_SESSIONS.md](../reference/TOKENS_AND_SESSIONS.md) and [TOKEN_FYI.md](../reference/TOKEN_FYI.md).

## Contents

- [AUTH-7: BFF sign-up, sign-in and sign-out with httpOnly cookies](#auth-7-bff-sign-up-sign-in-and-sign-out-with-httponly-cookies): A member can now sign up, sign in and sign out in the web app, and the browser never sees a token or calls Nest.
- [AUTH-8: proxy.ts refresh and the Data Access Layer](#auth-8-proxyts-refresh-and-the-data-access-layer): A member now stays signed in past the 15-minute access token, until the refresh token runs out.

## AUTH-7: BFF sign-up, sign-in and sign-out with httpOnly cookies

[#41](https://github.com/craig-o-curtis/dudesphere/issues/41) · 2026-10-15 · Authentication

**TLDR.** A member can now sign up, sign in and sign out in the web app, and the browser never sees a token or calls Nest. Next is the BFF, the backend for the frontend: it keeps Nest's two tokens in two httpOnly cookies, which page scripts can't read. The refresh cookie travels only to paths under `/api/auth`, so sign-in can be a Server Action, but sign-out has to be a Route Handler that checks Origin itself.

### How it works here

1. **Sign in.** `apps/web/src/components/SignInForm/SignInForm.tsx` → `SignInForm`: the form posts to the `signIn` Server Action. Next first checks that the `Origin` header matches `Host`.
2. `apps/web/src/lib/actions/auth.ts` → `signIn` calls `apps/web/src/lib/api.ts` → `apiFetch("/auth/token")`, from the Next server to Nest. Nest answers `{ accessToken, refreshToken, expiresIn }`.
3. `auth.ts` → `endOldSignIn`: if the browser already holds a `__Host-session` cookie, it sends that token to Nest's `POST /auth/sign-out`, which ends the old sign-in. This works only while the old access token is valid, for 15 minutes.
4. `apps/web/src/lib/session.ts` → `startSession(pair, next)` sets both cookies and returns `safeNextPath(next)`, from `apps/web/src/lib/next-path.ts`. `signIn` then calls `redirect()` to that path.
5. **Sign out.** `apps/web/src/components/SessionCorner/SessionCorner.tsx` → `SessionCorner` renders `<form method="post" action="/api/auth/logout">`, a plain HTML form. The path is under `/api/auth`, so the browser sends `__Secure-refresh` with it.
6. `apps/web/src/app/api/auth/logout/route.ts` → `POST` calls `apps/web/src/lib/origin.ts` → `assertSameOrigin`, and answers 403 if it fails. It reads the refresh token with `readSessionCookies()` and sends it to Nest's `POST /auth/token/revoke`.
7. In Nest, `TokenService.revoke` marks the token's whole family revoked. A family is every refresh token of one sign-in, and they share one `sid`, the sign-in's id.
8. `apps/api/src/auth/jwt-auth.provider.ts` → `JwtAuth.validate` runs on every signed-in request. It calls `signInIsLive`, which asks `apps/api/src/typeorm/sign-ins.repository.ts` → `SignInsRepository.isLive` whether the token's `sid` is still going. It isn't, so the old access token gets 401 at once, not after its 15 minutes.
9. Back in `POST`: `clearSessionCookies()` clears both cookies, each at its own path, and `apps/web/src/lib/route-responses.ts` → `seeOtherToHome` answers 303 to `/`.

### Look-alikes

|                         | `__Host-session`                                                            | `__Secure-refresh`                                     |
| ----------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------ |
| Holds                   | The access token, a JWT                                                     | The refresh token, 43 random characters                |
| `path`                  | `/`: sent with every request                                                | `/api/auth`: sent only to the handlers under it        |
| `maxAge`                | `expiresIn`, 900 seconds                                                    | 604800 seconds, 7 days                                 |
| What the prefix demands | `Secure`, `Path=/` and no `Domain`, so no subdomain can plant or replace it | `Secure` only. `__Host-` would force `Path=/`          |
| In this app             | `session.ts` → `SESSION_COOKIE`                                             | `session.ts` → `REFRESH_COOKIE`, `REFRESH_COOKIE_PATH` |

Both are `httpOnly`, `secure: true` and `sameSite: "lax"`. The refresh path is narrow on purpose. A refresh token works once, and a cookie at `/` would ride along on every request, where requests sent side by side could race it.

|                         | Server Action                             | Route Handler                                                     |
| ----------------------- | ----------------------------------------- | ----------------------------------------------------------------- |
| What it is              | A `'use server'` function a form posts to | A `route.ts` file that answers HTTP itself                        |
| Posts to                | The page's own path, such as `/login`     | Its own path, such as `/api/auth/logout`                          |
| Gets `__Secure-refresh` | Never: `/login` isn't under `/api/auth`   | Yes, under `/api/auth`                                            |
| Origin check            | Next does it                              | None from Next. The handler calls `assertSameOrigin`              |
| In this app             | `actions/auth.ts` → `signIn`, `signUp`    | `logout/route.ts` → `POST`, `logout-everywhere/route.ts` → `POST` |

|            | `POST /auth/token/revoke`             | `POST /auth/sign-out` (new)                                  | `POST /auth/sign-out-everywhere`                                           |
| ---------- | ------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Takes      | The refresh token, in the body        | The access token, as the bearer token                        | The access token, as the bearer token                                      |
| Ends       | That token's sign-in                  | The sign-in named by the token's `sid`                       | Every sign-in of the member                                                |
| Nest code  | `TokenService.revoke`, in the package | `SessionsController.signOut` → `SignInsRepository.endSignIn` | `SessionsController.signOutEverywhere` → `SignInService.signOutEverywhere` |
| Web caller | `logout/route.ts` → `POST`            | `actions/auth.ts` → `endOldSignIn`                           | `logout-everywhere/route.ts` → `signOutEverywhere`                         |

All three stop the ended sign-in's access tokens on their next request, through the `sid` check in step 8. The NestJS docs don't do that: they leave issued access tokens valid until they expire. The docs' `/auth/sign-out` is also different. It is `@Public()` and ends the browser session in Nest's own cookie. This API has no cookie session, so its `/auth/sign-out` needs the access token and ends that token's `sid`. A `sid` from another member ends nothing, because `endSignIn` matches on the member's id too.

Sign out everywhere may find the access token missing, or refused by Nest with 401. Then `signOutEverywhere` swaps the refresh token once through `POST /auth/token/refresh` and tries again. If Nest refuses the refresh token with 401, the sign-in had already ended, and the browser lands on `/?signout=ended`. Any other failure revokes this device only, and lands on `/?signout=partial`.

**The 15-minute limit, until AUTH-8.** `__Host-session` lives as long as the access token, 900 seconds, and nothing refreshes it yet. After that `SessionCorner` reads no access token and shows the signed-out links, while the refresh cookie and the sign-in in Nest live on. An old sign-in whose access token has expired also survives the next sign-in, because `endOldSignIn` has no token to send. AUTH-8 adds the refresh handler that keeps the cookie fresh.

### The code

```ts
// NEW FILE: apps/web/src/app/api/auth/logout/route.ts
export async function POST(request: Request): Promise<Response> {
  // Next checks Origin on Server Actions only. Without this, any site could
  // post a form here and sign the member out.
  if (!assertSameOrigin(request)) {
    return new Response(null, { status: 403 });
  }

  const { refreshToken } = await readSessionCookies();
  if (refreshToken) {
    try {
      // Ends the token's whole sign-in at Nest. Nest answers 204 for an
      // unknown token too, so a token that already ran out is no error.
      await apiFetch<void>("/auth/token/revoke", {
        method: "POST",
        body: { refreshToken },
      });
    } catch (error) {
      logFailure("Sign out", error);
    }
  }

  await clearSessionCookies();
  return seeOtherToHome();
}
```

```ts
// NEW FILE: apps/web/src/lib/session.ts
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
```

Every sign-in ends in `startSession`. AUTH-52's email-link, passkey and social sign-ins will call it too.

### Watch out

- **A Route Handler has no CSRF guard of its own.** Next compares `Origin` with `Host` for Server Actions only. Each `/api/auth` handler calls `assertSameOrigin` first. It is stricter than Next: a missing Origin, or `"null"`, fails. The check sits in each handler, not in `proxy.ts`, because a matcher change can silently drop proxy coverage. The security review also found the app could be framed by another site, so a click trick could force "Sign out everywhere" (SEC-1). `apps/web/next.config.ts` → `headers()` now sends `frame-ancestors 'none'` and `X-Frame-Options: DENY`.
- **`?next=` is an open redirect unless the server checks it.** `NextPathField` copies it from the URL as it is, so `startSession` passes it through `safeNextPath` on the server. That keeps only a same-origin path outside `/api`, and gives `/` for anything else, such as `//evil.example.com`. One trap it handles: `URL` drops tabs without a word, so `"/\t/evil"` would parse as `//evil`. `safeNextPath` refuses control characters before it parses.
- **Clear a cookie at the path it was set on.** `cookies().delete(name)`, given a name only, clears the cookie at `/` and leaves `__Secure-refresh` in place. `clearSessionCookies` sets each cookie to `""` at its own path with `maxAge: 0`, and sends `Secure` again. A browser refuses a `__Host-` or `__Secure-` cookie without `Secure`, even one that clears it.

### Read more

- [Server Actions: security, and the Origin check](https://nextjs.org/docs/app/guides/server-actions)
- [Data security: allowed origins](https://nextjs.org/docs/app/guides/data-security#allowed-origins-advanced)
- [`cookies()`: options, `delete` and `maxAge: 0`](https://nextjs.org/docs/app/api-reference/functions/cookies)
- [MDN: `Set-Cookie`, cookie prefixes and `Path`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie#cookie_prefixes)
- [NestJS docs: authentication, and letting customers manage their sessions](https://docs.nestjs.com/security/authentication)
- [frontend-architecture.md: Auth as a BFF](../context/frontend-architecture.md#auth-as-a-bff)
- [TOKENS_AND_SESSIONS.md: Signing out](../reference/TOKENS_AND_SESSIONS.md#signing-out)
- [TOKENS_AND_SESSIONS.md: How an access token is tied to its sign-in](../reference/TOKENS_AND_SESSIONS.md#how-an-access-token-is-tied-to-its-sign-in)
- The rendering side of this story: [rendering-lesson.md, AUTH-7](./rendering-lesson.md#auth-7-bff-sign-up-sign-in-and-sign-out-with-httponly-cookies)

## AUTH-8: proxy.ts refresh and the Data Access Layer

[#42](https://github.com/craig-o-curtis/dudesphere/issues/42) · 2026-10-15 · Authentication

**TLDR.** A member now stays signed in past the 15-minute access token, until the refresh token runs out: 7 days without a visit, and 30 days at most for one sign-in. The idea: the refresh token travels only to `/api/auth` and works only once, so `proxy.ts` sends any navigation whose access token is about to run out to one refresh handler. That handler swaps the token at most once per server, and keeps the new pair only when it belongs to the same sign-in as the session cookie.

### How it works here

The member's access token has 20 seconds left. They open `/feed`.

1. **The browser** sends `GET /feed` with `__Host-session`, but not `__Secure-refresh`, whose path is `/api/auth`. `__Host-session` now lives 7 days, as long as the refresh cookie, though the token inside it still runs out after 15 minutes. `apps/web/src/lib/session.ts` → `startSession` sets both with `REFRESH_MAX_AGE_SECONDS`. Without that, proxy couldn't tell a member whose token ran out from an anonymous visitor, and redirecting visitors would loop: refresh, `/login`, refresh.
2. `apps/web/src/proxy.ts` → `proxy` → `needsRefresh`: `apps/web/src/lib/access-token.ts` → `readTokenTimes` decodes `exp` and `iat` with no signature check. `refreshWindowSeconds` gives `min(60, floor((exp - iat) / 2))`, and `expiresWithin` compares with gmt's clock. Inside the window, or unreadable: 307 to `/api/auth/refresh?next=/feed`. No cookie at all: pass through, signed out.
3. `apps/web/src/app/api/auth/refresh/route.ts` → `GET`. The path is under `/api/auth`, so now the browser sends both cookies. `rawSessionCookie` must find `__Host-session`, or the member counts as signed out and Nest isn't called.
4. `route.ts` → `refreshFromCookie` refuses a request that carries `__Secure-refresh` twice (`session.ts` → `hasDuplicateRefreshCookie`). It reads the refresh token with `readSessionCookies`, and refuses a session token with no `sid` (`access-token.ts` → `readTokenSid`). The `sid` is the sign-in's id, the same in every access token of one sign-in.
5. `apps/web/src/lib/refresh.ts` → `refreshOnce` keys a module-level `Map` by the SHA-256 of the refresh token. A second request with the same token, from another tab say, gets the same promise. After Nest answers, the pair stays 10 seconds, so a tab that arrives a moment late with the old cookie gets that pair and doesn't send a spent token.
6. In Nest, `TokenService.refresh` (from `@nestjs/authentication`) spends the token and returns its successor, with the family's claims, `sid` included. A token used a second time throws "reused" and revokes the whole family.
7. Back in `refreshFromCookie`, `access-token.ts` → `sameSignIn(sessionToken, pair.accessToken)` must find the same `sid` in the old and the new access token, or nothing is saved.
8. `GET` calls `startSession(pair, next, "/feed")`, which sets both cookies, and `redirectTo` answers 303 to `/feed` with `Cache-Control: no-store`.
9. `/feed` renders. `apps/web/src/components/FeedWelcome/FeedWelcome.tsx` → `FeedWelcome` calls `requireSession("/feed")`, which only reads the cookie. Then `getMe()` calls Nest's `GET /users/me` with the Bearer token, and Nest's `JwtAuth.validate` checks the signature and that the `sid` is live (AUTH-7). Only that Nest check proves who the member is. If Nest answers 401, `FeedWelcome` sends them to `/login?next=%2Ffeed`.

When refresh fails, every path clears `__Host-session`, so proxy lets the next request through as anonymous. A 401 from Nest, or a refusal in steps 3, 4 or 7, clears both cookies and lands on `/login?next=%2Ffeed`. Nest down (a 5xx, a 429 or no answer) clears only `__Host-session`, keeps the unspent refresh cookie, and lands on `/feed`, which sends the member to sign in. Client components get the same through `apps/web/src/lib/client-fetch.ts` → `clientFetch`: after a 401 from `/api/bff`, it posts to `/api/auth/refresh` once for the whole tab, and retries once.

### Look-alikes

|                                                  | `verifySession` and `requireSession`                                    | `getMe`                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------- | ---------------------------------------------------------- |
| What it checks                                   | The cookie holds a JWT-shaped token whose unchecked `exp` hasn't passed | Nest's answer to `GET /users/me`, with the token as Bearer |
| Catches a forged token, or one ended at sign-out | No                                                                      | Yes: Nest checks the signature and the `sid`               |
| Calls Nest                                       | No                                                                      | Once per render, through React's `cache()`                 |
| When to use it                                   | Choosing what to try: which links to show, an early trip to `/login`    | Anything private. Render it only when Nest answered        |
| In this app                                      | `session.ts`; `SessionCorner`; the first line of `FeedWelcome`          | `session.ts`; the second line of `FeedWelcome`             |

Both columns are authentication: they ask who the member is. Neither is authorization. `requireSession` lets a forged token through, so it guards nothing on its own (SEC-2). The member's role comes from `getMe`, never from the token, which carries none on purpose. What the member may do is decided in Nest, by its guards, on every call made with the Bearer.

|              | `GET /api/auth/refresh`                                                | `POST /api/auth/refresh`                                       |
| ------------ | ---------------------------------------------------------------------- | -------------------------------------------------------------- |
| Who calls it | `proxy.ts`, by redirecting a navigation                                | `clientFetch`, after a 401 from `/api/bff`                     |
| Origin check | None. A cross-site GET can only swap the tokens for ones it never sees | `assertSameOrigin`, or 403 with no cookie touched              |
| Success      | 303 to `next`, or `/feed`                                              | 204                                                            |
| Signed out   | 303 to `/login?next=`                                                  | 401. `clientFetch` then sends the browser to `/login?next=`    |
| Nest down    | 303 to `next`, with `__Host-session` cleared                           | 503. `clientFetch` hands its caller the first 401, no redirect |
| In this app  | `refresh/route.ts` → `GET`                                             | `refresh/route.ts` → `POST`                                    |

Both call `refreshFromCookie`, so the checks and the cookie writes are the same.

### The code

```ts
// NEW FILE: apps/web/src/lib/refresh.ts
export function refreshOnce(refreshToken: string): Promise<TokenPair> {
  const key = keyOf(refreshToken);
  const pending = refreshes.get(key);
  if (pending) {
    return pending;
  }

  const promise = apiFetch<TokenPair>("/auth/token/refresh", {
    method: "POST",
    body: { refreshToken },
  });
  refreshes.set(key, promise);
  // Both handlers return nothing and never throw, so this chain never
  // rejects. Callers see the failure on `promise` itself.
  promise.then(
    () => forgetAfterHold(key, promise),
    () => forget(key, promise),
  );
  return promise;
}
```

```ts
// NEW FILE: apps/web/src/app/api/auth/refresh/route.ts
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
```

`refreshOnce` stores the promise, not the result, so a request that arrives while Nest is still answering joins the same call. A failure leaves the `Map` at once, so the next request asks Nest again.

### Watch out

- **A flat 60-second window loops.** qa-skeptic set `JWT_EXPIRES_IN=60` and got `ERR_TOO_MANY_REDIRECTS` (QA-1). A token that lives 60 seconds is "within 60 seconds" the moment Nest issues it, so the 303 back to the page went straight to refresh again. `refreshWindowSeconds` caps the window at half the token's life. A token that lives 2 seconds or less can still loop as the second ticks over, so `JWT_EXPIRES_IN` must be 3 or more.
- **A sibling subdomain can plant `__Secure-refresh`, but not `__Host-session`.** `__Secure-` allows a `Domain` attribute, and `__Host-` forbids one. owasp-hacker proved live that a planted refresh cookie could sign the member in to the attacker's account (SEC-1, SEC-6). Three checks close it: refresh only with `__Host-session` present, refuse a refresh cookie sent twice, and keep a fresh pair only when its `sid` matches the session cookie's. AUTH-7's sign-out routes now use the access token first, through Nest's `POST /auth/sign-out`, for the same reason.
- **The 10-second hold is a grace period, on the web side.** Nest has none by choice: a thief who replays a spent token inside a grace window gets a working pair (TOKENS_AND_SESSIONS.md). The hold brings back that cost for 10 seconds, on one server, and the spec accepts it. The `sid` check narrows it, because a replay must come with a session cookie of the same sign-in. Two servers can still race. The loser gets 401 "reused", and the member signs in again.

### Read more

- [Next.js authentication: optimistic checks with Proxy](https://nextjs.org/docs/app/guides/authentication#optimistic-checks-with-proxy-optional)
- [Next.js authentication: creating a Data Access Layer](https://nextjs.org/docs/app/guides/authentication#creating-a-data-access-layer-dal)
- [NestJS docs: authentication, refresh token rotation and reuse](https://docs.nestjs.com/security/authentication)
- [MDN: `Set-Cookie`, cookie prefixes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie#cookie_prefixes)
- [frontend-architecture.md: Auth as a BFF (Refresh, One refresh at a time, Client fetches)](../context/frontend-architecture.md#auth-as-a-bff)
- [TOKENS_AND_SESSIONS.md: Refreshing, step by step](../reference/TOKENS_AND_SESSIONS.md#refreshing-step-by-step)
- [TOKENS_AND_SESSIONS.md: Why a token used twice ends the whole family](../reference/TOKENS_AND_SESSIONS.md#why-a-token-used-twice-ends-the-whole-family)
- [TOKENS_AND_SESSIONS.md: Two requests at the same moment](../reference/TOKENS_AND_SESSIONS.md#two-requests-at-the-same-moment)
- The rendering side of this story: [rendering-lesson.md, AUTH-8](./rendering-lesson.md#auth-8-proxyts-refresh-and-the-data-access-layer)
