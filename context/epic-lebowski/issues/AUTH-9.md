# AUTH-9: Forgot and reset password pages

Part of the Lebowski epic. See [index.md](../index.md). Realm: Auth. Phase 0. Blocked by: AUTH-7.

**Scope:** `/forgot-password` asks Nest to email a reset link and then shows `/forgot-password/sent`. The emailed link opens `/reset-password?token=`, which sets the new password.

## Gap

Nest already sends reset links to `<FRONTEND_URL>/reset-password?token=<token>`, but no page lives at that address. `FRONTEND_URL` already points at the web app in development: it defaults to `http://localhost:3001`, and an empty `FRONTEND_URL=''` falls back to that default. A member who forgets a password today has no way back in through the web.

## Scope

- `apps/web/src/components/SignInForm/SignInForm.tsx`: add a "Forgot password?" link to `/forgot-password`, right under the password field and before Sign in. AUTH-7 left it out, because the page did not exist.
- `apps/web/src/app/(public)/forgot-password/page.tsx`: one email input. Server Action `requestReset(prev, formData)` calls Nest `POST /auth/password/forgot` with `{ email }`.
  - On 202 it redirects (303) to `/forgot-password/sent`, a static page that always says: "If that address has an account, we sent it a link." Nest answers 202 whether or not the address has an account, so the page must not hint either way.
  - On 429 it says how long to wait, from `Retry-After`.
- `apps/web/src/app/(public)/reset-password/page.tsx`: reads `token` from `searchParams`. Two password inputs, "New password" and "Same again". Server Action `resetPassword(prev, formData)` checks that the two match. If they don't, it says "The two passwords don't match." under "Same again" and makes no Nest call. If they do, it calls Nest `POST /auth/password/reset` with `{ token, password }`. Nest takes no `confirmPassword`.
  - On 204: redirect to `/login?reset=1`, which shows "Password changed. Roll in with the new one."
  - On 400 `RESET_TOKEN_INVALID`, or a 400 whose messages are about `token`: "That link no longer works." with a link to `/forgot-password`.
  - On 400 with password messages (for example, fewer than 12 characters): the message under "New password".
  - With no `token` in the URL: the same "That link no longer works." message, and no form.
- The reset page sends `Referrer-Policy: strict-origin` (in `next.config.ts` `headers()` for `/reset-password`). It never sends a path or query, so the token never leaks in a `Referer` header. `no-referrer` would make a plain HTML form post send `Origin: null`, and Next refuses the Server Action (500).
- `apps/web/e2e/password-reset.spec.ts`: the whole flow, reading the email through Mailpit's HTTP API on port 8025. It skips when Mailpit is down, and deletes its `e2e-` messages afterwards.

## Design notes

- **No session needed.** Both pages are public and never call `getMe()`.
- **The token stays out of logs and history.** The Server Action reads it from the form, not from the URL. The page renders a hidden input with it. Once that input has rendered, a small client component removes the token from the address bar with `window.history.replaceState`. A reload after that shows "That link no longer works."
- **A reset ends every sign-in.** Nest stamps `passwordChangedAt` and ends every sign-in in one transaction. Any cookies this browser still holds stop working, so the success path calls `clearSessionCookies()` from AUTH-7's `lib/session.ts` before the redirect. That clears each cookie at its own path: `__Host-session` at `/` and `__Secure-refresh` at `/api/auth`.
- **New passwords are 12 to 128 characters.** The input carries `minLength={12}` and `maxLength={128}` as a hint; Nest is the rule.
- **Show a visible "required" cue on every auth form (WEB-54 A11Y-1, WCAG 3.3.2).** The sign-in and sign-up labels give no visible sign that a field is required. Only the native `required` tells screen readers. WEB-54 kept their copy word for word, so it left this to AUTH-9. Add one "All fields are required." line in the shared `AuthForm`, above the fields, so all four forms get it. Build both new pages on `AuthForm` and the composed fields (`EmailField`, `PasswordField`).
- **`AuthForm` becomes a plain shell.** It stops rendering `NextPathField` (with its `<Suspense>` and `carryNextPath`) and `CookieNote`. `SignInForm` and `SignUpForm` compose them instead and behave as before. Forgot and reset carry no `next` and set no cookies, so they show neither.
- **The reset form needs JavaScript (accepted).** It reads `?token=`, so it sits in a `<Suspense>` hole. Cache Components forces the `searchParams` read into a hole, and React's streaming renderer sends every streamed `<Suspense>` hole as `<div hidden id="S:n">`, which only its inline script reveals. The hole's fallback, in the static shell, holds a `<noscript>` line: "Turn on JavaScript to set a new password." The `/login?reset=1` notice is hidden the same way, which is harmless because the sign-in form still works. Forgot is unaffected: its form is in the static shell.
- **The token stays in `history.state` (accepted).** After the strip, Next's router copies its tree into `history.state`, and the tree names the page segment with the query. So the token stays in `history.state` for that entry. Only a script on that page can read it, the token works once, and it dies after 30 minutes. Clearing it would need the token kept out of the URL, for example a Route Handler that sets a cookie, which was not built.
- **Proxy skips the password pages.** `/forgot-password`, `/forgot-password/sent` and `/reset-password` pass through `proxy.ts` untouched (`NO_SESSION_PATHS`, exact paths). They need no session, and a refresh redirect would carry the reset token into `/login?next=...`.
- **The reset ends this browser's sign-in (SEC-3).** On 204 `resetPassword` calls `endOldSignIn` (moved to `lib/session.ts`, shared with `signIn` and `signUp`), then `clearSessionCookies()`, then redirects. A 401 from that sign-out is logged by method, path and status, and the reset goes on.
- **Accepted limit, like AUTH-8's QA-4.** If this browser's access token has expired but its refresh token is live, the sign-out gets a 401. That sign-in then lives at Nest until it expires, up to 7 days. Its only cookie is cleared, so nothing can use it.
- **`apiFetch` and empty bodies.** It returns `undefined` for an empty body on a 202 or a 204 only. An empty 200 or 201 still throws.
- **Shared error helpers.** The 400, 429 and "unavailable" mapping that `signIn` and `signUp` use moves out of `lib/actions/auth.ts` into a server-only module that is not `'use server'`. A `'use server'` file may export only async functions. The new actions live in `lib/actions/password.ts`.

## Rendering strategy

With `cacheComponents` on, a JavaScript-off Server Action POST that returns state (an error) instead of redirecting gets no HTML shell, so the page is blank. This holds for the errors from `requestReset` and `resetPassword` too. The forgot success path redirects with a 303, so forgot works with JavaScript off. The reset form does not show with JavaScript off (see below). The `minLength` hint catches a short password before the post. See "Known limit" in `rendering-strategies.md`.

`/forgot-password` and `/forgot-password/sent` are static. `/reset-password` reads `searchParams`, so its form sits inside a Suspense boundary and the rest of the page stays in the static shell. The `/login?reset=1` notice reads `searchParams` in its own Suspense boundary, so the sign-in form stays in the static shell. Both forms use Server Actions with `useActionState`.

With JavaScript off, React's streaming renderer leaves every streamed Suspense hole inside `<div hidden id="S:n">`, because only its inline script reveals it. Cache Components only forces the `searchParams` read into a hole. So the reset form never shows, and its fallback in the static shell has the `<noscript>` line "Turn on JavaScript to set a new password." This is how holes stream, not a Next bug, and it differs from vercel/next.js#99756. See the second "Known limit" in `rendering-strategies.md`.

## Verification

- `pnpm db:up`, request a reset for an e2e user, open Mailpit at http://localhost:8025: the link starts with `http://localhost:3001/reset-password?token=`.
- The link sets a new password; `/login` accepts it and shows "Password changed. Roll in with the new one."; the old password gets the 401.
- The same link a second time shows "That link no longer works."
- `/reset-password` with no token shows the same message and no form.
- After the page loads, the address bar shows `/reset-password` with no token.
- An address with no account lands on the same `/forgot-password/sent`.
- Mismatched passwords show "The two passwords don't match." and make no Nest call.
- An 11-character password shows Nest's 400 message.
- The reset page's response carries `Referrer-Policy: strict-origin`.
- With JavaScript off, forgot succeeds and the reset page shows the noscript line.
- `/login`, `/signup`, `/forgot-password` and `/reset-password` show "All fields are required."
- `e2e/password-reset.spec.ts` passes, and `pnpm e2e:check` is clean afterwards.

## Done when

- [ ] `/forgot-password`, `/forgot-password/sent` and `/reset-password` pages with Server Actions
- [ ] "Forgot password?" on `/login`, and "All fields are required." on every auth form
- [ ] `Referrer-Policy: strict-origin` on the reset page, and the token removed from the address bar
- [ ] `e2e/password-reset.spec.ts` passes, and the Mailpit flow is checked by hand
- [ ] `context/overview.md` "Forgot password" names the web pages
- [ ] Rows updated in `rendering-strategies.md`
