# AUTH-7: BFF sign-up, sign-in and sign-out with httpOnly cookies

Part of the Lebowski epic. See [index.md](../index.md). Realm: Auth. Phase 0. Blocked by: WEB-5, WEB-6, REPO-3.

**Scope:** The web app signs members up and in through Server Actions, and signs them out through Route Handlers. It calls Nest and keeps the token pair in two httpOnly cookies, so page scripts never see a token and the browser never calls Nest.

Planned 2026-10-14. The decisions, and why the plan differs from the first draft of this spec, are in [handoffs/AUTH-7.md](../handoffs/AUTH-7.md).

## Gap

Nest is bearer-only: it answers a token pair and reads `Authorization: Bearer`. It sets no cookies and sends no CORS headers, on purpose. A browser can't hold a bearer token safely in script-readable storage. So the web app is the backend for the frontend (BFF): it holds the tokens in cookies and adds the bearer header itself on every call to Nest.

## Scope

**Pages** (in `apps/web/src/app/(public)/`), both static, with a client form in the static shell:

- `/signup`: email, display name, username and password. The hints say that the display name is what other members see, and that the username is private and can't hold `@` or spaces.
- `/login`: one "Email" input (posted to Nest as `identifier`) and a password. There's no "Forgot password?" link yet; AUTH-9 adds it with its page. AUTH-52 later turns this page into "Roll in".
- Both honour `?next=<path>`, checked by `safeNextPath()`, and show one cookie line under the form.

**Server Actions** (`apps/web/src/lib/actions/auth.ts`):

- `signIn(prev, formData)` calls Nest `POST /auth/token`.
- `signUp(prev, formData)` calls Nest `POST /auth/sign-up` with `{ username, email, password, profile: { displayName } }`, then `POST /auth/token`.
- On success, each calls `startSession(pair, next)` and then `redirect()` to the safe target.
- On failure, each returns `{ fieldErrors, formError, values }` to `useActionState`. `values` never holds a password.

**Route Handlers** (`apps/web/src/app/api/auth/`), `POST` only. Each checks `Origin` with `assertSameOrigin()` and answers 303 to `/`:

- `logout/route.ts` calls Nest `POST /auth/token/revoke` with the refresh cookie, then clears both cookies.
- `logout-everywhere/route.ts` calls Nest `POST /auth/sign-out-everywhere` with the access token. If the access token is missing or gets a 401, it first refreshes once. Then it clears both cookies.

Sign-out can't be a Server Action. An action posts to the page's own path, so the refresh cookie, which is limited to `/api/auth`, never reaches it.

**Nest route `POST /auth/sign-out`** (added in review): bearer auth, answers 204. It ends only the sign-in named by the access token's `sid` and its whole refresh family. `signIn` and `signUp` call it with the old access cookie after `POST /auth/token` succeeds and before the new cookies are set, so signing in again ends the previous sign-in. It only works while the old access token is valid (15 minutes), until AUTH-8 keeps that cookie fresh. `context/overview.md` documents it.

**Partial sign-out:** if Nest can't sign out the other devices, `logout-everywhere` still revokes this device's refresh token, clears the cookies and answers 303 to `/?signout=partial`. The corner then says: "You're signed out here, but we couldn't reach your other devices. Sign in and try Sign out everywhere again."

**Anti-framing headers:** `next.config.ts` `headers()` sends `Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY` on every route. WEB-45 owns the rest of the security headers.

**Cookies**, both `httpOnly`, `secure: true` (also on localhost), `sameSite: "lax"`:

| Name               | Holds             | `path`      | `maxAge`            |
| ------------------ | ----------------- | ----------- | ------------------- |
| `__Host-session`   | the access token  | `/`         | `expiresIn` (900 s) |
| `__Secure-refresh` | the refresh token | `/api/auth` | 7 days (604800 s)   |

They are cleared with `set(name, "", { path, maxAge: 0 })`, because `delete(name)` only clears path `/`. They use `maxAge` only, never `expires`, which takes a `Date`.

**`lib/session.ts`** (`server-only`) holds the cookie names and options, `startSession(pair, next)`, `clearSessionCookies()` and `readSessionCookies()`. AUTH-8 adds the Data Access Layer to it. AUTH-52's new ways in also finish through `startSession()`.

**`lib/api.ts`** (`server-only`): `apiFetch<T>(path, { method, body, token, extraHeaders })` calls `${process.env.API_URL}${path}` and adds `Authorization: Bearer` when given a token. It throws `ApiRequestError` on a non-2xx answer. That error carries the status, the `ApiError` body from `@dudesphere/api-types`, the `errorCode`, `Retry-After`, and the 400 messages mapped to fields. API-10 adds `X-Bff-Secret` and `X-Client-Ip` through `extraHeaders`.

**`lib/next-path.ts`** has `safeNextPath()`, which accepts only a same-origin path. **`lib/origin.ts`** has `assertSameOrigin()`.

**Signed-in corner on `/`**: a `<Suspense>` hole. Signed out, it shows "Sign in" and "Sign up" links. Signed in, it shows the "Sign out" and "Sign out everywhere" forms. Its fallback is the signed-out view.

## Design notes

- **The browser never calls Nest.** Nest has no CORS, and page scripts never hold a token. The cost is one extra hop per request.
- **The refresh cookie is path-limited to `/api/auth`.** It travels only to the logout handlers and AUTH-8's refresh handler, not with every page. AUTH-8 explains how pages still get a fresh token (redirect-to-refresh).
- **No `proxy.ts` yet.** AUTH-8 adds it for optimistic redirects only. Route Handlers get no Origin check from Next, so each one checks Origin itself.
- **Field errors come from Nest.** No zod and no client-side schema. Native constraint attributes (`required`, `type`, `minlength`, `maxlength`, `pattern`) copy Nest's rules, so the browser catches most bad input, even with JavaScript off. Nest's 400 body is a flat list of messages. `lib/api.ts` maps each one to its field by the property path it starts with. Any other message shows at the form level.
- **No client-side identifier parsing.** Nest still accepts a username or an email as `identifier`. The form asks for an email only, ahead of AUTH-52.
- **Every Server Action and Route Handler re-checks what it needs.** Layouts never check auth.
- **No cookie banner.** These cookies are strictly necessary, and the theme cookie is set at the member's request. WEB-53 adds the privacy page before the first deploy.
- **Error copy:**
  - 401: "That email or password doesn't match."
  - 429: "Easy, man. Try again in N minutes.", with N from `Retry-After`.
  - 5xx: "Something went sideways on our end. Try again in a moment."
  - The account is made, but the sign-in step after it fails: "Your account is ready, but we couldn't sign you in just now." with a "Sign in" link.

## Rendering strategy

`/login` and `/signup` are static pages with a client form in the static shell. The forms post to Server Actions with `useActionState`, which teaches progressive enhancement: each form works before hydration and with JavaScript off. The logout handlers teach the BFF pattern and the `cookies()` API in a handler. The corner on `/` is a streamed hole in a static shell.

## Verification

- Sign up with a new e2e user. Nest creates the user and profile, and both cookies are set with the names, paths and flags above.
- `document.cookie` in the browser shows neither cookie.
- A wrong password shows the one 401 message. Six tries in 15 minutes show the 429 message with the wait.
- A taken display name, in any letter case, shows the 409 message under the display name input.
- A username with `@` shows Nest's 400 message under the username input.
- Sign out:
  - Nest revokes the refresh token, and both cookies are gone.
  - A reused old access token gets a 401 from Nest.
- Sign out everywhere: a second browser's access token gets a 401, and its refresh token is refused.
- With JavaScript off, a valid sign-in or sign-up submits and lands on the target. The browser's own checks catch empty, malformed and wrong-length fields. A server error with JavaScript off shows a blank page: that is a known Next 16.4 limit with `cacheComponents`, and AUTH-7 records it rather than working around it.
- `next` lands on a safe path, and `//evil.example.com` lands on `/`.
- A cross-origin POST to either logout handler gets 403.
- The network panel shows no request from the browser to the API origin (`API_URL`).

## Done when

- [ ] `/signup` and `/login` pages with `useActionState` forms that work with JavaScript off
- [ ] `signIn` and `signUp` Server Actions
- [ ] `api/auth/logout` and `api/auth/logout-everywhere` Route Handlers with the Origin check
- [ ] `lib/api.ts`, `lib/session.ts`, `lib/next-path.ts` and `lib/origin.ts`
- [ ] The signed-in corner on `/`
- [ ] Vitest specs for `apiFetch` error mapping, the cookie helpers, `safeNextPath`, the Origin check, the actions and the handlers
- [ ] `e2e/auth.spec.ts` passes locally against the real API
- [ ] Rows added to `rendering-strategies.md`
