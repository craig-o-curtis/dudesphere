# AUTH-7: BFF sign-up, sign-in and sign-out with httpOnly cookies

Part of the Lebowski epic. See [index.md](../index.md). Realm: Auth. Phase 0. Blocked by: WEB-5, WEB-6, REPO-3.

**Scope:** The web app signs members up, in and out through its own Route Handlers and Server Actions, which call Nest and keep the token pair in two httpOnly cookies, so page scripts never see a token and the browser never calls Nest.

## Gap

Nest is bearer-only: it answers a token pair and reads `Authorization: Bearer`. It sets no cookies and sends no CORS headers, on purpose. A browser cannot hold a bearer token safely in script-readable storage. The web app has to be the backend for the frontend (BFF): it holds the tokens in cookies and adds the bearer header itself on every call to Nest.

## Scope

**Pages** (in `apps/web/src/app/(public)/`):

- `/signup`: username, email, password, display name. The form says a username cannot hold `@` or spaces, and that the display name is what other members see while the username is only for signing in.
- `/login`: one "Username or email" input and a password. "Forgot password?" links to `/forgot-password` (AUTH-9). AUTH-52 later turns this page into "Roll in".

**Route Handlers** (`apps/web/src/app/api/auth/`):

- `login/route.ts`, `POST`: reads `{ identifier, password }`, calls Nest `POST /auth/token`, sets the cookies, answers 204. Passes through 401 `BAD_CREDENTIALS` and 429 `RATE_LIMITED` with `Retry-After`.
- `signup/route.ts`, `POST`: calls Nest `POST /auth/sign-up` with `{ username, email, password, profile: { displayName } }`, then the same `POST /auth/token` step. Passes through 400 field messages and 409 `EMAIL_TAKEN`, `USERNAME_TAKEN` and `DISPLAY_NAME_TAKEN`.
- `logout/route.ts`, `POST`: calls Nest `POST /auth/token/revoke` with the refresh cookie, clears both cookies, answers 204.

**Server Actions** (`apps/web/src/lib/actions/auth.ts`): `signIn(prev, formData)`, `signUp(prev, formData)`, `signOut()` and `signOutEverywhere()`. The forms use these with `useActionState`; the Route Handlers above serve client-side calls and the refresh redirect in AUTH-8. Both paths share `lib/auth-cookies.ts`.

**Cookies**, both `httpOnly`, `secure`, `sameSite: "lax"`:

| Name      | Holds             | `path`      | `maxAge`            |
| --------- | ----------------- | ----------- | ------------------- |
| `session` | the access token  | `/`         | `expiresIn` (900 s) |
| `refresh` | the refresh token | `/api/auth` | 7 days (604800 s)   |

**`lib/api.ts`:** `apiFetch<T>(path, init & { token?: string })` calls `${process.env.API_URL}${path}`, adds `Authorization: Bearer` when a token is given, parses JSON, and turns a non-2xx answer into an `ApiError` (from `@dudesphere/api-types`) carrying the status, the `errorCode` and the field messages. It also sets `X-Bff-Secret` and `X-Client-Ip` (API-10).

**Sign out:** `signOut()` calls `POST /auth/token/revoke`, then clears both cookies, then `redirect("/")`. "Sign out everywhere" calls `POST /auth/sign-out-everywhere` with the bearer token. Nest ends every sign-in and stops their access tokens at once (the `sid` check); the action still clears the cookies, because a dead token left in them would cost a 401 and a failed refresh on the next page.

## Design notes

- **The browser never calls Nest.** No CORS on Nest, no token in page scripts. The cost is one extra hop per request.
- **The refresh cookie is path-limited to `/api/auth`.** It travels only to the refresh and logout handlers, not with every page. AUTH-8 explains how pages still get a fresh token (redirect-to-refresh).
- **Field errors come from Nest.** No zod and no client-side schema. The 400 body's field messages go under each input. The only client check is "the two passwords match" on reset (AUTH-9).
- **No client-side identifier parsing.** Nest decides whether the identifier is a username or an email and ignores letter case.
- **Every Server Action and Route Handler re-checks the session.** Layouts never check auth.
- **Error copy.** 401: "That username, email or password doesn't match." 429: "Easy, man. Try again in N minutes." with N from `Retry-After`.

## Rendering strategy

`/login` and `/signup` are static pages with a client form. The forms post to Server Actions with `useActionState`, which teaches progressive enhancement: each form works before hydration. The Route Handlers teach the BFF pattern and the `cookies()` API in a handler.

## Verification

- Sign up with a new e2e user: Nest creates the user and profile, both cookies are set, `session` has `path=/`, `refresh` has `path=/api/auth`, both `HttpOnly; Secure; SameSite=Lax`.
- `document.cookie` in the browser shows neither cookie.
- A wrong password shows the one 401 message. Six tries in 15 minutes show the 429 message with the wait.
- A taken display name, in any letter case, shows the 409 message under the display name input.
- A username with `@` shows Nest's 400 message under the username input.
- Sign out: Nest revokes the refresh token, both cookies are gone, and a reused old access token gets a 401 from Nest.
- The forms submit with JavaScript off.
- The network panel shows no request from the browser to port 3000.

## Done when

- [ ] `/signup` and `/login` pages with `useActionState` forms
- [ ] `api/auth/login`, `signup` and `logout` Route Handlers
- [ ] `lib/api.ts` and `lib/auth-cookies.ts`
- [ ] Sign out and sign out everywhere
- [ ] Vitest specs for `apiFetch` error mapping and the cookie helpers
- [ ] Row added to `rendering-strategies.md`
