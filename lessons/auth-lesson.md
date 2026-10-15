# Auth: the lessons

This file teaches authentication (proving who the member is) and authorization (deciding what a known member may do) in Dudesphere: the NestJS API in `apps/api` and the Next.js app in `apps/web`. Each entry comes from one story, in the order the stories were built, so the file reads as a course from top to bottom. Every step names the file and the function to open. The API's own study notes are [TOKENS_AND_SESSIONS.md](../reference/TOKENS_AND_SESSIONS.md) and [TOKEN_FYI.md](../reference/TOKEN_FYI.md).

## Contents

- [AUTH-7: BFF sign-up, sign-in and sign-out with httpOnly cookies](#auth-7-bff-sign-up-sign-in-and-sign-out-with-httponly-cookies): A member can now sign up, sign in and sign out in the web app, and the browser never sees a token or calls Nest.

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
