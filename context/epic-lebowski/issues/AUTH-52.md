# AUTH-52: Passwordless sign-in

Part of the Lebowski epic. See [index.md](../index.md). Realm: Auth. Phase 1. Blocked by: AUTH-7, AUTH-8, API-10, WEB-54.

**Scope:** A fullstack story: members sign up and sign in with an emailed link, a passkey, or Google or GitHub, from one "Roll in" screen, while existing members keep their password as a fallback.

Added on 2026-10-14 at Craig's request: sign-in must be super easy. It is the first story of Phase 1. Size L.

## Gap

Today the only way in is a username or email plus a password of 12 to 128 characters. That is the slowest sign-in there is, and the one people forget. Craig wants email links first, passkeys, and social sign-in where it helps.

The installed `@nestjs/authentication` 0.1.1 already ships most of the server side, checked in `apps/api/node_modules/@nestjs/authentication/dist/`:

- `MagicLinkService` and the abstract `MagicLinkHandler` (`dist/magic-link/`).
- `OidcService` with `google()`, `github()` and `microsoft()` presets, and the abstract `OidcAccountResolver` (`dist/oidc/`).
- `EmailVerificationService` and the abstract `EmailVerificationHandler` (`dist/account/`).
- `MfaService` with TOTP (`dist/mfa/`). Not used by this story.

It has no WebAuthn or passkey support. `@simplewebauthn/server` 14.0.3 and `@simplewebauthn/browser` 14.0.0 are current.

Two facts from the package shape the design:

1. **Links and OIDC are bound to the browser that asked.** `MagicLinkService.create()` refuses a request from an origin other than the app's own and `session.trustedOrigins`, and sets a `__Host-magic_link_tx` cookie. `consume()` finds the link only with that cookie. Nest is cookie-free and the browser only talks to Next, so Next must forward the browser's `Origin` and relay that cookie both ways.
2. **`consume()` signs in through `SignInService`, which makes a cookie session** (`IssuedSession` with a `Set-Cookie` value), not the bearer pair. This app issues bearer pairs through `TokenService.issue()`, as `TokensController.issue` does. The Nest route must turn a successful `consume()` into a token pair and must not pass the session cookie on.

## Scope

### Nest (`apps/api`)

**Module `apps/api/src/auth/passwordless/`:**

- `magic-link.handler.ts`: `PasswordlessMagicLinkHandler extends MagicLinkHandler`. Registers itself in its constructor with `registry.registerHandler("magicLink", this)`.
  - `send(link)`: sends the email through `MailProvider`. Subject "Your Dudesphere link". Body: one button "Roll in", the link's expiry in minutes, and "If you didn't ask for this, ignore it. Nothing happens."
  - `resolveUser(email)`: finds the live user whose `email` equals the link's address (citext compare, trimmed, lower-cased). Returns `null` when the address belongs to an account with `emailVerifiedAt IS NULL` (see pre-hijacking below). For an unknown address on a sign-up link, creates the user and profile in one transaction and returns it.
- `magic-link.controller.ts`, `@Public()`, `@Controller("auth/magic-link")`:
  - `POST /auth/magic-link`, Public: body `{ email, displayName? }`. `displayName` present means a passwordless sign-up. Calls `MagicLinkService.create(email, { redirectTo })`. Answers 202 with no body for any well-formed email, like forgot password. The response carries the package's `Set-Cookie: __Host-magic_link_tx=...`.
  - `POST /auth/magic-link/consume`, Public: body `{ token }`, plus the relayed `__Host-magic_link_tx` cookie. Calls `consume(token, { request })`. On success it ends the cookie session `consume()` created, then calls `TokenService.issue(String(userId), { method: "magic-link", claims: { amr: [...], sid: randomUUID() } })` and answers 200 with `{ accessToken, refreshToken, expiresIn }`. It strips the session `Set-Cookie`. `null` answers 400 `MAGIC_LINK_INVALID`, "That link no longer works". A link from another browser answers the package's 401.
  - First check whether the package has a token-mode path that skips the cookie session. If it does, use it and drop the "end the cookie session" step.
- `email-verification.handler.ts`: `EmailVerificationHandler` with `send(link)` through `MailProvider`, and `markVerified(userId, email)` setting `user.emailVerifiedAt` to now (gmt) when the stored email still matches.
- Email verification routes on `@Controller("auth/email")`:
  - `POST /auth/email/verify-request`, Token: sends a verification link to the caller's email. 202.
  - `POST /auth/email/verify`, Public: body `{ token }`. 204, or 400 `VERIFY_TOKEN_INVALID`.
- A used magic link marks the address verified too: the link proves the member reads that inbox.

**Passkeys, module `apps/api/src/passkeys/`** on `@simplewebauthn/server`:

- Entity `passkey.entity.ts`, table `passkey`:

  | Column       | Type                  | Notes                                        |
  | ------------ | --------------------- | -------------------------------------------- |
  | `id`         | text PK               | The credential id, base64url                 |
  | `userId`     | int FK `user.id`      | `ON DELETE CASCADE`, indexed                 |
  | `publicKey`  | bytea                 |                                              |
  | `counter`    | bigint                | Signature counter, checked to rise           |
  | `transports` | text[]                | `usb`, `nfc`, `ble`, `internal`, `hybrid`    |
  | `name`       | varchar(60)           | "MacBook Touch ID"; the member can rename it |
  | `createdAt`  | timestamptz           | Set by the database                          |
  | `lastUsedAt` | timestamptz, nullable |                                              |

- Table `passkey_challenge`: `id` uuid PK, `userId` int nullable (null for sign-in), `challenge` text, `purpose` enum `register` or `sign-in`, `expiresAt` timestamptz (5 minutes). Deleted on use. Expired rows deleted on each new challenge.
- Routes on `@Controller("auth/passkeys")`:
  - `POST /auth/passkeys/register/options`, Token: `generateRegistrationOptions` with `rpID`, `rpName: "Dudesphere"`, `userName` the display name, `excludeCredentials` the member's passkeys. Answers the options plus a `challengeId`.
  - `POST /auth/passkeys/register/verify`, Token: `{ challengeId, response, name }`. `verifyRegistrationResponse` with `expectedOrigin` and `expectedRPID`. Saves the row. 201 with `{ id, name, createdAt }`.
  - `POST /auth/passkeys/sign-in/options`, Public: `generateAuthenticationOptions` with no `allowCredentials` (discoverable credentials). Answers options and `challengeId`.
  - `POST /auth/passkeys/sign-in/verify`, Public: `{ challengeId, response }`. Looks up the passkey by credential id, runs `verifyAuthenticationResponse`, bumps `counter` and `lastUsedAt`, then `TokenService.issue(...)`. 200 with the token pair. Any failure: 401 `PASSKEY_REFUSED`.
  - `GET /passkeys/me`, Token: the caller's passkeys, without `publicKey`.
  - `PATCH /passkeys/:id`, owner: `{ name }`.
  - `DELETE /passkeys/:id`, owner: 204. Refused with 409 `LAST_SIGN_IN_METHOD` if it is the member's only way in (no password, no other passkey, no verified email).
- Env: `WEBAUTHN_RP_ID` (the web origin's host, `localhost` in development) and `WEBAUTHN_ORIGIN` (`http://localhost:3001`).

**Social, `apps/api/src/auth/oidc/`:**

- Register `google({ clientId, clientSecret })` and `github({ clientId, clientSecret })` presets. Env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`. A provider whose env is unset is not registered, and the web form hides its button.
- `oidc-account.resolver.ts`: `DudesphereOidcResolver extends OidcAccountResolver`. `resolveUser(profile, tokens, context)`:
  - Finds an account already linked to `(provider, subject)` in a new table `oidc_identity` (`provider` varchar(20), `subject` text, `userId` int FK cascade, `createdAt`; PK `(provider, subject)`).
  - Otherwise links to an existing account only when the provider marks the email verified and it equals the account's email. Then it also sets `emailVerifiedAt`.
  - Otherwise creates a new account, with the provider's name as the starting display name (deduplicated with a number if taken).
- Routes on `@Controller("auth/oidc")`, all Public:
  - `POST /auth/oidc/:provider/start`: calls `OidcService.start(provider, { redirectTo, request })`. Answers `{ url }` and the transaction `Set-Cookie`.
  - `POST /auth/oidc/:provider/callback`: body `{ code, state }`, plus the relayed transaction cookie. Finishes the login, then issues the token pair as above.

**Schema changes** (one migration, append-only):

- `user.emailVerifiedAt` timestamptz, nullable. Existing rows stay null.
- `user.username` and `user.password` become nullable, only if the decision below says so.
- New tables `passkey`, `passkey_challenge`, `oidc_identity`.
- `email_tokens.purpose` gains `email-verification`.

**Config:** `AuthenticationModule` options gain `magicLink` (TTL 15 minutes), `session.trustedOrigins: [FRONTEND_URL]`, and the OIDC providers.

**Rate limits**, in `AuthThrottlerGuard` terms, counted per email and IP (with API-10's client IP):

- `POST /auth/magic-link`: 3 in 15 minutes, as for forgot password.
- `POST /auth/email/verify-request`: 3 in 15 minutes.
- `POST /auth/passkeys/sign-in/verify`: 10 in 15 minutes per IP.

**Error codes** added to `ErrorCode`: `MAGIC_LINK_INVALID` (400), `VERIFY_TOKEN_INVALID` (400), `PASSKEY_REFUSED` (401), `LAST_SIGN_IN_METHOD` (409).

### Next (`apps/web`)

- `/login` becomes "Roll in", `apps/web/src/app/(public)/login/page.tsx`:
  - One email field with `autocomplete="username webauthn"`, so the browser offers a saved passkey as the member types (conditional UI, `startAuthentication({ useBrowserAutofill: true })`).
  - Buttons, in order: "Email me a link", "Use a passkey", "Continue with Google", "Continue with GitHub".
  - A small "Use a password" link that reveals the AUTH-7 password form on the same page.
  - "New here? Sign up" links to `/signup`, which asks for email and display name only.
- Route Handlers in `apps/web/src/app/api/auth/`:
  - `magic-link/route.ts`, `POST`: forwards `{ email, displayName? }` to Nest with the browser's `Origin` header, and copies Nest's `Set-Cookie: __Host-magic_link_tx` onto its own response unchanged.
  - `magic-link/consume/route.ts`, `POST`: forwards `{ token }` and the browser's `__Host-magic_link_tx` cookie to Nest. On 200 sets the `session` and `refresh` cookies (AUTH-7's helper) and answers 204.
  - `passkeys/[...step]/route.ts`: forwards the four passkey calls; on sign-in success sets the cookies.
  - `oidc/[provider]/start/route.ts` (`POST`, then redirect to `url`) and `oidc/[provider]/callback/route.ts` (`GET` from the provider, then `POST` to Nest, then the cookies, then redirect to `next`).
- `/auth/link?token=` page: **the emailed link opens this page, which POSTs the token.** It shows "Rolling you in..." and a "Continue" button that submits a form. It never consumes on GET, because mail scanners and link previews follow GET links and would burn the token.
- `/dudes/me/sign-in` page: list, rename and delete passkeys; "Add a passkey"; "Verify my email".
- After a first sign-in by link or social, a one-time banner offers "Add a passkey, sign in faster next time."
- `@simplewebauthn/browser` added to `apps/web`.

## Design notes

- **Account pre-hijacking.** The package warns: if accounts can be made without proving the email (password sign-up does that today), refuse links to accounts whose email was never verified. Otherwise whoever registered `walter@example.com` first, without owning it, keeps access after the real owner signs in by link. So `resolveUser` returns `null` for an unverified account, and this story adds verification. A member with an unverified address gets a "Verify your email" banner and keeps the password path.
- **The relying party is the web origin.** The browser talks only to Next, so `rpID` is the web host. In production that is the Vercel domain, not the Nest host.
- **Link only on a provider-verified email.** Google's `email_verified` claim and GitHub's primary verified email. An unverified provider email never links to an existing account.
- **Strip the session cookie.** If `consume()` or the OIDC callback emits `Set-Cookie: __Host-sid=...`, the Nest route must not pass it on. Next must relay only `__Host-magic_link_tx` and the OIDC transaction cookie, by name.
- **`__Host-` cookies need `Secure` and `path=/`.** Browsers accept `Secure` on `http://localhost`, so development works without HTTPS.
- **Passwords stay a fallback** for existing accounts. Nothing removes a member's password.
- **One screen.** Every method starts from the same email field, so a member never has to remember how they signed up.

### Decision needed: optional username and password

Passwordless sign-up asks for email and display name only. Today `user.username` and `user.password` are `NOT NULL`. Options:

1. **Make both nullable** (recommended). A passwordless member has no username and no password. Sign-in by `identifier` works for members who have one. `PATCH /users/me` can add either later. Costs: every reader of `username` handles null; `CredentialsService.verify` refuses a null hash; the admin users table shows "No username".
2. **Generate a username** (such as `dude-7f3a`) and keep the column `NOT NULL`. Costs: a name the member never chose; collisions to handle.

Craig decides inside the story, before the migration is written.

### Possible split

The story may split into three sub-issues in gmt's style, each with its own spec file and tracker entry directly under this one:

- **AUTH-52a**: email links and email verification, the "Roll in" form and `/auth/link`.
- **AUTH-52b**: passkeys.
- **AUTH-52c**: Google and GitHub.

52a goes first: 52b and 52c reuse its token-pair step and its form.

## Rendering strategy

"Roll in" is a static page with client islands: the passkey autofill and the buttons are a Client Component; the email-link form is a Server Action with `useActionState`. `/auth/link` reads `searchParams` inside Suspense and never consumes on render. The Route Handlers extend the BFF row with cookie relay. Record "relay a third-party cookie through a Route Handler" as its own row in `rendering-strategies.md`.

## Verification

Email links:

- Request a link for a verified e2e user. Mailpit shows one email. Opening the link in the same browser and pressing "Continue" signs in; `session` and `refresh` cookies are set; no `__Host-sid` cookie is set.
- The same link a second time: "That link no longer works."
- The link opened in a second browser profile: the package's 401, with "Open the link in the browser you asked from."
- A `POST /auth/magic-link` with `Origin: https://evil.example.com`: 403, no email.
- A link for an unverified account: no sign-in, same "no longer works" answer.
- Four requests in 15 minutes for one email: the fourth gets 429 with `Retry-After`.
- A GET of `/auth/link?token=...` by a link previewer leaves the token usable.
- Passwordless sign-up with an unused email and display name creates the user and profile, marks the email verified, and signs in.

Passkeys:

- Register a passkey with Chrome's virtual authenticator (Playwright `cdpSession` `WebAuthn.addVirtualAuthenticator`). Sign out. The email field offers it; selecting it signs in.
- A replayed assertion (same counter): 401 `PASSKEY_REFUSED`.
- A challenge older than 5 minutes: 401.
- Deleting the only sign-in method: 409 `LAST_SIGN_IN_METHOD`.
- Deleting a user cascades to their `passkey` rows (real delete in the e2e cleanup).

Social:

- With the provider mocked (OIDC test server or the package's `testing/` helpers): a new subject creates an account; the same subject signs in to it; a verified email equal to an existing account links to it; an unverified email creates a new account and never links.

E2E housekeeping:

- `apps/api/test/global-setup.ts` deletes `passkey`, `passkey_challenge` and `oidc_identity` rows for e2e users.

## Done when

- [ ] "Decision needed" settled and recorded here
- [ ] Split decided (one story or 52a, 52b, 52c in the tracker)
- [ ] Migration with `emailVerifiedAt`, the three new tables and the decided nullability
- [ ] Magic link handler, controller and token-pair step, with no session cookie leaking
- [ ] Email verification routes and banner
- [ ] Passkey module, routes and `/dudes/me/sign-in`
- [ ] Google and GitHub through `OidcService`, linking only by verified email
- [ ] "Roll in" page, `/auth/link` POST page, cookie relay Route Handlers
- [ ] Rate limits as listed, with API-10's client IP
- [ ] Unit and e2e specs as listed; new tables in the e2e cleanup
- [ ] `context/overview.md` Auth and Rate limits sections updated; `reference/TOKENS_AND_SESSIONS.md` gains the three new flows
- [ ] Row added to `rendering-strategies.md`
