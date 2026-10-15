# AUTH-9: Forgot and reset password pages

Part of the Lebowski epic. See [index.md](../index.md). Realm: Auth. Phase 0. Blocked by: AUTH-7, WEB-54.

**Scope:** `/forgot-password` asks Nest to email a reset link, `/reset-password?token=` sets the new password, and Nest's `FRONTEND_URL` points at the web origin so the emailed link opens the Next page.

## Gap

Nest already sends reset links to `<FRONTEND_URL>/reset-password?token=<token>`, but no page lives at that address. `FRONTEND_URL` points at nothing useful in development. A member who forgets a password today has no way back in through the web.

## Scope

- `apps/web/src/app/(public)/forgot-password/page.tsx`: one email input. Server Action `requestReset(prev, formData)` calls Nest `POST /auth/password/forgot` with `{ email }`.
  - On 202 the page always says: "If that address has an account, we sent it a link." Nest answers 202 whether or not the address has an account; the page must not hint either way.
  - On 429 it says how long to wait, from `Retry-After`.
- `apps/web/src/app/(public)/reset-password/page.tsx`: reads `token` from `searchParams`. Two password inputs, "New password" and "Same again". The form checks that they match before it posts. Server Action `resetPassword(prev, formData)` calls Nest `POST /auth/password/reset` with `{ token, password }`. Nest takes no `confirmPassword`.
  - On 204: redirect to `/login?reset=1`, which shows "Password changed. Roll in with the new one."
  - On 400 `RESET_TOKEN_INVALID`: "That link no longer works." with a link to `/forgot-password`.
  - On 400 with field messages (for example, fewer than 12 characters): the message under the input.
- `apps/api/.env.example`: `FRONTEND_URL=http://localhost:3001`. Craig's own `apps/api/.env` needs the same change by hand.
- The reset page sends `Referrer-Policy: no-referrer` (in `next.config.ts` `headers()` for `/reset-password`), so the token never leaks in a `Referer` header.

## Design notes

- **No session needed.** Both pages are public and never call `getMe()`.
- **The token stays out of logs.** The Server Action reads it from the form, not from the URL. The page renders a hidden input with it.
- **A reset ends every sign-in.** Nest stamps `passwordChangedAt` and ends every sign-in in one transaction. Any cookies this browser still holds stop working, so the success path clears them before the redirect.
- **New passwords are 12 to 128 characters.** The input carries `minLength={12}` and `maxLength={128}` as a hint; Nest is the rule.

## Rendering strategy

`/forgot-password` is static. `/reset-password` reads `searchParams`, so its form sits inside a Suspense boundary and the rest of the page stays in the static shell. Both use Server Actions with `useActionState`.

## Verification

- `pnpm db:up`, request a reset for an e2e user, open Mailpit at http://localhost:8025: the link starts with `http://localhost:3001/reset-password?token=`.
- The link sets a new password; `/login` accepts it; the old password gets the 401.
- The same link a second time shows "That link no longer works."
- An address with no account shows the same 202 message.
- Mismatched passwords show "The two passwords don't match." and make no Nest call.
- An 11-character password shows Nest's 400 message.
- The reset page's response carries `Referrer-Policy: no-referrer`.

## Done when

- [ ] `/forgot-password` and `/reset-password` pages with Server Actions
- [ ] `FRONTEND_URL` points at 3001 in `apps/api/.env.example`
- [ ] `Referrer-Policy: no-referrer` on the reset page
- [ ] Mailpit flow checked by hand
- [ ] `context/overview.md` "Forgot password" names the web page
- [ ] Row added to `rendering-strategies.md`
