# Tokens and sessions

## TLDR description

A member who signs in gets two tokens. The **access token** proves who they
are on every request, and lasts 15 minutes. The **refresh token** does one
thing: it is swapped for a new pair when the access token runs out, and it
works once.

The refresh tokens of one sign-in form a **family**. The server can end a
family at any moment, and its refresh tokens stop working at once.

**The access token does not stop with its family.** Signing out ends the
refresh tokens, and an access token already handed out keeps working until it
expires, up to 15 minutes later. The NestJS docs accept this, and so does
this app. A password change, a password reset and a closed account are
different: they stop access tokens on the very next request.

The code is the official packages `@nestjs/authentication` 0.1.1 and
`@nestjs/authorization` 0.1.0, set up as
[docs.nestjs.com/security/authentication](https://docs.nestjs.com/security/authentication)
and
[docs.nestjs.com/security/authorization](https://docs.nestjs.com/security/authorization)
show. The app writes the parts only it knows: how to find a member, how to
check a password, how to send the reset email, and where the rows live.

The flows below are run over real HTTP and the real database by
[test/tokens.e2e-spec.ts](../test/tokens.e2e-spec.ts). The password reset
flow is in
[test/password-reset.e2e-spec.ts](../test/password-reset.e2e-spec.ts), and
the guards are in
[test/authorization.e2e-spec.ts](../test/authorization.e2e-spec.ts).

## The words

| Word            | What it means here                                                                                         |
| --------------- | ---------------------------------------------------------------------------------------------------------- |
| Sign in         | Swap a username or email and a password for a pair. Older notes say "log in"                               |
| Access token    | A signed JWT. Sent with every request as `Authorization: Bearer <accessToken>`                             |
| Refresh token   | 43 random characters. Sent to two routes only: to get a new pair, or to sign out                           |
| Pair            | One access token and one refresh token, handed out together                                                |
| Family          | Every refresh token of one sign-in: the first one and each one swapped for since. They share a `family_id` |
| Successor       | The new refresh token a client gets when it swaps the old one                                              |
| Rotation        | Replacing the refresh token on every use. Each one works once                                              |
| Revoke          | End a family on purpose. `revoked` becomes `true` on its rows                                              |
| Session         | In this app now: a row in the `sessions` table, for browser cookie sign-ins. This API makes none           |
| Opaque          | Carrying no readable data. The refresh token is opaque; the access token is not                            |
| Guard           | Code that runs before a route and can refuse the request. This app has three, all global                   |
| Policy, ability | A class that says who may do what (`UserPolicy`), and one of its methods (`viewAll`). `@Can()` names both  |

**"Session" changed meaning on 2026-10-14.** Before, one sign-in was one
session, with a row in the `session` table. Now one sign-in is one family of
refresh tokens. The word "session" now names something this API does not
use: the package's browser sessions, kept in a cookie. The next table sets
the three side by side.

|                                | A family (what a sign-in is now)       | The old `session` row (gone) | A row in `sessions` (unused)                  |
| ------------------------------ | -------------------------------------- | ---------------------------- | --------------------------------------------- |
| What it stands for             | One sign-in from one device            | One sign-in from one device  | One browser signed in with a cookie           |
| Where it lives                 | Rows in `refresh_tokens` sharing an id | One row in `session`         | One row in `sessions`                         |
| Its id                         | `family_id`, 22 random characters      | `id`, a UUID                 | `id`, the hash of the cookie's value          |
| Does the access token name it? | No                                     | Yes, as `sid`                | No access token is involved                   |
| Checked on every request?      | No                                     | Yes                          | Only for a cookie, which this API never reads |
| Made by                        | `TokenService.issue`                   | `SessionsService.start`      | `SignInService.signIn`, which nothing calls   |

## Old name, new name

Everything below was renamed or replaced on 2026-10-14. Use this table to
read older notes, commits and the course.

| Before                               | Now                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------- |
| `POST /auth/login`                   | `POST /auth/token`                                                                    |
| `POST /auth/refresh`                 | `POST /auth/token/refresh`                                                            |
| `POST /auth/logout`                  | `POST /auth/token/revoke`                                                             |
| `POST /auth/logout-all`              | `POST /auth/sign-out-everywhere`                                                      |
| `POST /auth/signup`                  | `POST /auth/sign-up`                                                                  |
| `POST /auth/forgot-password`         | `POST /auth/password/forgot`                                                          |
| `POST /auth/reset-password`          | `POST /auth/password/reset`, without `confirmPassword`                                |
| One `AuthController` for every route | `AuthController`, `TokensController`, `SessionsController`, `PasswordResetController` |
| `AuthService.login`                  | `CredentialsService.verify`, then `TokenService.issue`                                |
| `SessionsService.start`              | `TokenService.issue`                                                                  |
| `SessionsService.refresh`            | `TokenService.refresh`                                                                |
| `SessionsService.end`                | `TokenService.revoke`                                                                 |
| `SessionsService.endAll`             | `TokenService.revokeAll`, called by `SignInService.signOutEverywhere`                 |
| `SessionsService.isLive`             | Nothing. An access token is no longer checked against its sign-in                     |
| `SessionsRepository`                 | `TypeOrmAuthenticationStore`                                                          |
| Table `session`                      | A family: the `family_id` column of `refresh_tokens`                                  |
| Table `refresh_token`                | Table `refresh_tokens`                                                                |
| Table `password_reset_token`         | Table `email_tokens`, with `purpose` set to `password-reset`                          |
| The app's `PasswordResetService`     | The package's `PasswordResetService`, plus the app's `PasswordResetMailer`            |
| `one-time-token.ts`                  | The package makes and hashes its own tokens                                           |
| `JwtAuthGuard`                       | The `AuthenticationModule` guard, with the app's `JwtAuth` provider                   |
| `RolesGuard` and `@Auth(roles)`      | The `AuthorizationModule` guard, with `@Can(Policy, ability)` or `@Can.Anyone()`      |
| `HashingProvider`, bcrypt            | `PasswordHasher`, scrypt. Old bcrypt hashes still sign in, and are replaced           |
| The `sid` claim                      | Gone. The access token names no sign-in                                               |
| `LoginDto`                           | `SignInDto`                                                                           |
| `RefreshDto`, `LogoutDto`            | `RefreshTokenDto`, for both routes                                                    |
| `ForgotPasswordDto`                  | `EmailDto`                                                                            |
| 401 `TOKEN_MISSING`                  | 401 with `errorCode: "missing_credentials"`                                           |
| 401 `TOKEN_INVALID`                  | 401 whose `message` says what was wrong, such as `"invalid signature"`                |
| 401 `REFRESH_TOKEN_INVALID`          | 401 `"Refresh token invalid"`, `"expired"` or `"reused"`                              |
| `SESSION_EXPIRES_IN`                 | `REFRESH_TOKEN_ABSOLUTE_EXPIRES_IN`                                                   |
| `SESSION_RETENTION` (180 days)       | Gone. A family's rows go when the family reaches its end                              |

The migration
[1791960794027-AuthenticationTables.ts](../src/database/migrations/1791960794027-AuthenticationTables.ts)
copied every old refresh token and reset link into the new tables, so nobody
was signed out and no reset link stopped working. Each old session became a
family with the same id.

## The two tokens

|                              | Access token                                  | Refresh token                                    |
| ---------------------------- | --------------------------------------------- | ------------------------------------------------ |
| What it is                   | A JWT: three parts with dots between          | 32 random bytes, written as 43 characters        |
| What it carries              | The member's id, and how they signed in       | Nothing. It is only a key to a row               |
| How long it lasts            | 15 minutes                                    | 7 days, and each use starts a new 7 days         |
| The longest a sign-in lasts  | Not limited by the access token               | 30 days after the sign-in, however often renewed |
| How often it is sent         | With every request                            | Only when the access token has run out           |
| Where it is sent             | Every route that needs a signed-in member     | `/auth/token/refresh` and `/auth/token/revoke`   |
| How the server checks it     | Verifies the signature, then reads the member | Looks up its hash in `refresh_tokens`            |
| What the server stores       | Nothing                                       | A SHA-256 hash of it, never the token            |
| How many times it works      | As often as needed until it expires           | Once                                             |
| Can the server end it early? | Only by a password change or closed account   | Yes, at any moment, by revoking its family       |

**Why two?** They pull in opposite directions. The token that travels with
every request is the one most likely to leak, so it should die fast. But a
member should not have to type a password every 15 minutes. So the short
token does the travelling, and a long one stays home and only comes out to
fetch a new short one.

## Not the same thing: the password reset token

The app has a third token, in a second table. It is not part of signing in.
It is named here so the two are never mixed up.

A **password reset token** is what the emailed "forgot password" link
carries. It lets a member who cannot sign in choose a new password. It looks
like a refresh token: 43 random characters, made and hashed by the same
package functions. The likeness ends there.

|                             | Refresh token, in `refresh_tokens`           | Reset token, in `email_tokens`                     |
| --------------------------- | -------------------------------------------- | -------------------------------------------------- |
| Its job                     | Keeps a signed-in member signed in           | Lets a member who cannot sign in choose a password |
| How the member gets it      | In the answer to a sign-in or a refresh      | By email, inside a link                            |
| How long it lasts           | 7 days, and 30 days for its family           | 30 minutes                                         |
| Does it belong to a family? | Yes. Its `family_id` is the sign-in          | No. It makes no family and no tokens               |
| How it is used up           | `used_at` is set, and the row stays          | The row is deleted                                 |
| How long its row stays      | Until its family's 30-day end                | Until it is used, or soon after it expires         |
| What else stops it          | Its family being revoked                     | A new email or a new password hash on the account  |
| Refused with                | 401 `"Refresh token invalid"` and others     | 400 `RESET_TOKEN_INVALID`                          |
| The code                    | `TokenService`, `TypeOrmAuthenticationStore` | `PasswordResetService`, `PasswordResetMailer`      |

The two meet in one place. A password reset ends every family the member
has, so every refresh token they held stops working.

[TOKEN_FYI.md](./TOKEN_FYI.md) walks through the reset flow step by step.

## What is inside the access token

A JWT is three base64 parts: a header, a payload and a signature. Anyone can
read the first two. Nobody can change them, because the signature is made
with `JWT_SECRET`, which only the server holds.

The payload of an access token from this app:

```json
{
  "iss": "dudesphere",
  "aud": "dudesphere-api",
  "jti": "3vQh8Zp1LmN0aR7tYw2kXc",
  "amr": ["pwd"],
  "sub": "25",
  "iat": 1791700000,
  "exp": 1791700900
}
```

| Claim | Meaning                                                                 | Who writes it                                        |
| ----- | ----------------------------------------------------------------------- | ---------------------------------------------------- |
| `iss` | "Issuer": who signed it                                                 | `JwtSigner`, from `JWT_ISSUER`                       |
| `aud` | "Audience": who the token is for                                        | `JwtSigner`, from `JWT_AUDIENCE`                     |
| `jti` | "JWT id": 16 random bytes, different in every token                     | `JwtSigner`. Nothing here reads it                   |
| `amr` | "Authentication methods": how the member signed in. `pwd` is a password | `TokensController.issue` passes it to `TokenService` |
| `sub` | "Subject": the member's user id, as a string                            | `TokenService.issue`, from `String(user.id)`         |
| `iat` | "Issued at", in seconds since 1970                                      | `JwtSigner`                                          |
| `exp` | "Expires", in seconds since 1970. Here `iat` plus 900                   | `JwtSigner`, from `JWT_EXPIRES_IN`                   |

`JwtSigner` is the package's class. `TokenService` builds one from the
`accessToken` options in [src/app.module.ts](../src/app.module.ts).

**There is no family id in it.** The old token carried `sid`, and the guard
read that session's row on every request. That is what made a sign-out stop
the access token at once. The package's tokens name no family, so a sign-out
cannot reach them.

**There is no role and no username in it, on purpose.** A token cannot
change once it is signed. A role in it would be a copy that goes stale the
moment an admin is demoted, and a username the moment a member is renamed.
`JwtAuth.validate` reads the member from the database on every request, and
a client that wants these asks `GET /users/me`.

**`amr` stays the same for the whole family.** `TokenService.issue` stores
it in the `claims` column of the family's rows, and `TokenService.refresh`
copies it into every new access token.

## The tables

The package keeps its state in three tables. The entities are in
[src/typeorm/authentication.entities.ts](../src/typeorm/authentication.entities.ts),
and
[src/typeorm/typeorm-authentication.store.ts](../src/typeorm/typeorm-authentication.store.ts)
reads and writes them.

```text
user ──< family ──< refresh_tokens row
             (no table: the rows share a family_id)
```

Read `──<` as "has many". A family is not a table of its own. It is every
row in `refresh_tokens` with the same `family_id`.

**`refresh_tokens`**: one row for each refresh token handed out.

| Column              | Holds                                                                         |
| ------------------- | ----------------------------------------------------------------------------- |
| `id`                | The SHA-256 hash of the token, as 43 base64url characters. The primary key    |
| `family_id`         | The sign-in it belongs to. 22 random characters, the same on every row of it  |
| `user_id`           | Whose it is: the user id as text, such as `"25"`                              |
| `created_at`        | When the row was made                                                         |
| `expires_at`        | When this one token stops working: 7 days on, but never past the family's end |
| `family_expires_at` | When the whole family ends: 30 days after the sign-in. The same on every row  |
| `used_at`           | When the token was swapped. Empty until then                                  |
| `revoked`           | `true` once the family was ended on purpose. Set on every row of the family   |
| `claims`            | What goes into each new access token: here `{ "amr": ["pwd"] }`               |

**`email_tokens`**: one row for each reset link that can still be used.

| Column        | Holds                                                                      |
| ------------- | -------------------------------------------------------------------------- |
| `id`          | The SHA-256 hash of the token in the link                                  |
| `purpose`     | `password-reset`. Later, email verification links will share the table     |
| `user_id`     | Whose link it is                                                           |
| `email`       | The address it was sent to. The link works only while the account keeps it |
| `fingerprint` | A hash of the member's password hash. The link works only while it matches |
| `created_at`  | When the link was made                                                     |
| `expires_at`  | When the link stops working: 30 minutes on                                 |

**`sessions`**: empty, and it stays empty. It is for browsers signed in with
a cookie, which this API does not do. The package still needs the table,
because a password reset and a sign-out-everywhere end sessions as well as
families. Nothing in this app writes a row to it.

**The token itself is never stored.** The server hashes whatever a client
sends and looks for that hash. Someone who reads the table finds hashes, and
a hash cannot be turned back into a token.

**`user_id` is text, with no foreign key to `user`.** The docs' tables are
built this way. The package passes user ids as strings, and its own tests for
a store use ids such as `"user-<uuid>"`, which an integer column would
refuse. So Postgres does not stop a user row being deleted while it has
token rows. The app never deletes a user row, so this does not come up yet.

Here is one family over three days. Walter signs in on Monday, and his
client refreshes on Tuesday and on Wednesday. That is three rows:

| `id` (hash of) | `family_id` | `used_at` | `expires_at`   | `family_expires_at` | `revoked` |
| -------------- | ----------- | --------- | -------------- | ------------------- | --------- |
| token A        | `kP3x…`     | Tuesday   | next Monday    | Monday + 30 days    | false     |
| token B        | `kP3x…`     | Wednesday | next Tuesday   | Monday + 30 days    | false     |
| token C        | `kP3x…`     |           | next Wednesday | Monday + 30 days    | false     |

Read it like this:

- Tokens A and B are spent. Only C can still be swapped.
- A token's `expires_at` moves forward with each new token. That is why a
  member who keeps coming back stays signed in.
- `family_expires_at` never moves. It is set at sign-in. After 30 days the
  family ends, whatever the member did.
- If Walter signs out on Thursday, one thing changes: `revoked` becomes
  `true` on all three rows.

## Signing in, step by step

`POST /auth/token` with `{ "identifier": "walter", "password": "..." }`.

1. `AuthThrottlerGuard` counts the try
   ([src/auth/auth-throttler.guard.ts](../src/auth/auth-throttler.guard.ts)).
   Five tries in 15 minutes are allowed for one identifier from one IP
   address. The sixth gets 429 `RATE_LIMITED`.
2. The authentication guard lets the request through with no token, because
   `TokensController` is marked `@Public()`.
3. The `ValidationPipe` checks the body against `SignInDto`
   ([src/auth/auth.dto.ts](../src/auth/auth.dto.ts)). It trims the
   identifier.
4. `TokensController.issue`
   ([src/auth/tokens.controller.ts](../src/auth/tokens.controller.ts)) calls
   `CredentialsService.verify`
   ([src/auth/credentials.service.ts](../src/auth/credentials.service.ts)):
   - `UsersRepository.findCredentials`
     ([src/users/users.repository.ts](../src/users/users.repository.ts))
     finds the member by email if the identifier has an `@`, and by username
     if not. A closed account is not found.
   - `verifyPassword`
     ([src/users/password-hashes.ts](../src/users/password-hashes.ts))
     checks the password. A bcrypt hash is checked with bcrypt. Anything
     else goes to the package's `PasswordHasher`, which uses scrypt. With no
     account, it checks a dummy hash, so the time taken does not give away
     which accounts exist.
   - If the hash is bcrypt, `needsRehash` says so, and
     `UsersRepository.replacePasswordHash` stores a scrypt hash of the same
     password. The password did not change, so no token is ended. It writes
     only while the stored hash is still the bcrypt one it checked, so a
     password change that lands in between is never undone.
5. A wrong identifier or password is 401 `BAD_CREDENTIALS`, with one message
   whichever was wrong.
6. `TokenService.issue` (the package's) starts the family:
   - it picks a new family id, 16 random bytes, and a family end 30 days
     away;
   - it makes a refresh token, 32 random bytes;
   - `TypeOrmAuthenticationStore.saveRefreshToken` saves a row holding the
     token's hash, the family id and `{ "amr": ["pwd"] }`;
   - it signs an access token with `sub` and `amr`.
7. The answer is 200:

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyNSJ9.c2lnbmF0dXJl",
  "refreshToken": "n8VbQ2k1ZxYp3mR7tLwA9cHd0eFgJiKoNsUvBq4y6Xs",
  "expiresIn": 900
}
```

`expiresIn` is the access token's lifetime in seconds, so a client knows when
to refresh without decoding anything.

Signing in twice, on a phone and a laptop, makes two families. Ending one
leaves the other alone.

## An ordinary request: the three guards

Every request passes three global guards, in this order. Global guards run
in module order, and `AppModule` registers its own guard first.

| #   | Guard                    | Registered by                       | Its question                                    | If the answer is no |
| --- | ------------------------ | ----------------------------------- | ----------------------------------------------- | ------------------- |
| 1   | `AuthThrottlerGuard`     | `APP_GUARD` in `AppModule`          | Has this caller sent too many requests?         | 429 `RATE_LIMITED`  |
| 2   | The authentication guard | `AuthenticationModule.forRootAsync` | Who is calling? (authentication)                | 401                 |
| 3   | The authorization guard  | `AuthorizationModule.forRoot()`     | May this caller use this route? (authorization) | 403                 |

**401 and 403 are not the same.** A 401 means "I do not know who you are":
no token, or a token that does not work. A 403 means "I know who you are, and
you may not do this".

The authentication guard does three checks on the access token:

1. **Is there a token?** No `Authorization: Bearer` header on a route that is
   not `@Public()` is 401 with `errorCode: "missing_credentials"`.
2. **Is the token real?** The package's `JwtBearerProvider` checks the
   signature, the algorithm (HS256 only), the expiry, the issuer and the
   audience. This needs no database.
3. **Is the member still there, with the same password?** `JwtAuth.validate`
   ([src/auth/jwt-auth.provider.ts](../src/auth/jwt-auth.provider.ts)) reads
   the member by the `sub` in the token, with `UsersRepository.findById`. It
   refuses the token if:
   - no live member has that id, because the account is closed; or
   - the token was signed in an earlier second than the member's
     `passwordChangedAt`, because the password changed since.

If all three pass, the member becomes `request.user`, and
`@CurrentUser()` hands it to the controller. A failed check 2 or 3 is a 401
whose `message` says why, such as `"token expired"` or `"unknown subject"`.

The authorization guard reads what the route declares:

| The route declares            | The guard                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| `@Public()`                   | Lets anyone through, signed in or not                                                                   |
| `@Can.Anyone()`               | Lets through any signed-in member                                                                       |
| `@Can(UserPolicy, "viewAll")` | Calls `UserPolicy.before`. If that decides nothing, calls `UserPolicy.viewAll`. 403 if the answer is no |
| Nothing                       | Refuses: 403 for a member, 401 for a guest. The startup log names the route                             |

A route that forgot its declaration is closed, not open.
[src/users/user.policy.ts](../src/users/user.policy.ts) and
[src/hashtags/hashtag.policy.ts](../src/hashtags/hashtag.policy.ts) are the
two policies. Both let admins through and nobody else. The role is read from
the member that `JwtAuth.validate` loaded, so a demoted admin loses admin on
their next request, with the same token.

On a `@Public()` route the authentication guard does not read the token at
all. A good one and a bad one are both ignored, and the caller goes through
as nobody: `@CurrentUser()` is `null`. A route that wants the caller when
there is one, and lets guests in too, uses `@Authenticate({ optional: true })`
instead. No route in this app does.

**The cost is one small query for each signed-in request**:
`UsersRepository.findById`. The old guard ran two, the member and the
session.

## Refreshing, step by step

`POST /auth/token/refresh` with `{ "refreshToken": "..." }`.

`TokensController.refresh` passes the token to `TokenService.refresh`, which
runs these checks in order. The first one that fails ends the request with a 401.

| #   | The check                                                      | If it fails                                              |
| --- | -------------------------------------------------------------- | -------------------------------------------------------- |
| 1   | Is it 43 characters of the right kind?                         | `"Refresh token invalid"`, with no query                 |
| 2   | Is there a row for its hash, in a family not revoked?          | `"Refresh token invalid"`                                |
| 3   | If it is unspent: is it inside its 7 days and its family's 30? | `"Refresh token expired"`. Nothing is spent or ended     |
| 4   | Is the row unused?                                             | **The family is revoked**, then `"Refresh token reused"` |
| 5   | Save the successor, then mark this token used                  | If the mark changes no row: family revoked, `"reused"`   |
| 6   | Sign a new access token with the family's claims               |                                                          |

The answer is a new pair, in the same shape as signing in. The client throws
the old refresh token away and keeps the new one.

Details worth knowing:

- **Step 2 covers every family that was ended**: by a sign-out, a reuse, a
  password change or a closed account. A token of such a family is refused
  as `invalid`, even a spent one, so no theft is reported for it.
- **Step 3 does not end the family.** A member who was away for 8 days has
  done nothing wrong. Their token has simply run out, and they sign in
  again.
- **A spent token is a reuse even after it expired.** Step 3 only lets an
  unspent token off as `expired`.
- **Step 5 saves before it marks.** If the app stopped between the two, the
  member would still hold a token that works, and could try again.
- **`TokenService.refresh` does not read the member.** A closed account's
  families are revoked when it closes, so step 2 catches it. If one slipped
  through, the new access token would still fail at `JwtAuth.validate`.
- **The old access token is not cancelled by a refresh.** It works until its
  own 15 minutes are up.

## Why a token used twice ends the whole family

This is the heart of the design, and it is called **reuse detection**.

A refresh token works once. So if a spent one ever comes back, two parties
must be holding it: the member's client, and someone who copied it. The
server cannot tell which is which. Both look the same from where it sits.

So it ends the family for both. Here is why that works, whichever of them
moved first.

**If the thief uses the stolen token first:**

1. Walter's client holds token A. A thief copies A.
2. The thief swaps A, and gets token B. A is now marked used.
3. Walter's client, which still holds A, tries to swap it.
4. A is already used. The server revokes the family.
5. The thief's token B is in that family, so it is dead too.
6. **The thief's access token still works for up to 15 minutes.** Nothing
   reaches it. This is the trade-off described below.
7. Walter signs in again with his password, which the thief does not have.

**If Walter's client uses it first:**

1. Walter's client swaps A and gets B. A is now marked used.
2. The thief tries the copy of A.
3. A is already used. The server revokes the family.
4. Walter is signed out too, and signs in again. The thief gets nothing.

Either way the thief loses the refresh token within one refresh, and the
worst that happens to the member is typing a password. Without rotation, a
stolen refresh token would work quietly for the whole 30 days.

The package reports the reuse as a `refresh-token-reused` event. This app
does not listen for it yet, so nothing is logged.

## Two requests at the same moment

Two browser tabs, or a request that was retried, can send the same refresh
token twice within a millisecond. Both requests read the row at step 4, and
both see it unused. Something has to decide who was first.

The database decides, with one statement in
[TypeOrmAuthenticationStore.markRefreshTokenUsed](../src/typeorm/typeorm-authentication.store.ts):

```sql
UPDATE "refresh_tokens" SET "used_at" = $1 WHERE "id" = $2 AND "used_at" IS NULL
```

Postgres lets only one of the two change the row. That request gets "1 row
changed" and succeeds. The other gets "0 rows changed", which is a second use
like any other, so the family is revoked.

**There is no grace period, by choice.** Some systems allow a second use
within a few seconds. This one does not: a thief who replays inside that
window would get a working pair. The price is paid by the client, which must
never send two refreshes at once for one family.

## Signing out

**This device.** `POST /auth/token/revoke` with `{ "refreshToken": "..." }`.

- `TokensController.revoke` calls `TokenService.revoke`, which finds the
  token's row and calls
  `TypeOrmAuthenticationStore.revokeRefreshTokenFamily`. That sets `revoked`
  on every row of the family.
- **That device's access token keeps working until it expires**, up to 15
  minutes. The client should throw it away.
- The member's other devices are untouched.
- The route is public, so a client can sign out with an access token that has
  already expired.
- It answers 204 for a real token and for nonsense alike, as RFC 7009 asks. A
  different answer would tell a caller whether a token they hold is real. A
  body the DTO refuses is a plain 400, as on any route: no `refreshToken`, an
  empty one, one that is not a string, or one over 1,000 characters.
- A spent token of the family works too, so a client that kept an old one
  can still sign out.

**Every device.** `POST /auth/sign-out-everywhere`, with the access token as
the bearer token.

- `SessionsController.signOutEverywhere`
  ([src/auth/sessions.controller.ts](../src/auth/sessions.controller.ts))
  calls the package's `SignInService.signOutEverywhere`. That ends every
  session (there are none) and calls `TokenService.revokeAll`, which sets
  `revoked` on every refresh token row the member has.
- **Every access token the member holds keeps working until it expires**, up
  to 15 minutes.
- The caller is signed out too.
- The user id comes from the access token, through `@CurrentUser("id")`,
  never from the body. A caller can only ever sign themselves out.
- A family started afterwards is not affected. The member can sign in again
  straight away.

## Everything that ends a sign-in

| What happened                          | Which families end  | The access tokens                | Where in the code                                                  |
| -------------------------------------- | ------------------- | -------------------------------- | ------------------------------------------------------------------ |
| `POST /auth/token/revoke`              | That one            | Work until they expire           | `TokenService.revoke`                                              |
| `POST /auth/sign-out-everywhere`       | All of the caller's | Work until they expire           | `SignInService.signOutEverywhere`, `TokenService.revokeAll`        |
| A refresh token used twice             | That one            | Work until they expire           | `TokenService.refresh`, step 4 or 5                                |
| The member changes their password      | All of the member's | **Stop on the next request**     | `UsersService.updateUser`, then `endSignIns`                       |
| An admin changes the member's password | All of the member's | **Stop on the next request**     | `UsersService.updateUser`, then `endSignIns`                       |
| The member resets a forgotten password | All of the member's | **Stop on the next request**     | `PasswordResetService.reset`, `PasswordResetMailer.updatePassword` |
| The account is closed                  | All of the member's | **Stop on the next request**     | `UsersService.deleteUser`, then `endSignIns`                       |
| An admin restores the account          | All of the member's | See "What it does not do"        | `UsersService.restoreUser`, then `endSignIns`                      |
| 30 days pass since the sign-in         | That one            | The last one runs its 15 minutes | `family_expires_at`                                                |
| 7 days pass with no refresh            | That one, in effect | None left: the last ran out      | `expires_at`                                                       |

**Why the password rows stop access tokens and the sign-out rows do not.**
`JwtAuth.validate` reads the member on every request. A password change
writes `passwordChangedAt`, and a closed account sets `deletedAt`. Both are
on the member's row, so the very next request sees them. A sign-out writes
only to `refresh_tokens`, which `JwtAuth.validate` never reads.

**A password change and the end of its families are two writes.**
`UsersService.updateUser` stores the new hash and `passwordChangedAt` first.
Then `endSignIns` revokes the families. The package writes through its own
store, so the two cannot share one transaction. If the second write fails,
the password is changed and the old refresh tokens still work until the
member tries again. Before 2026-10-14 the two were one transaction.

**A member who changes their own password is signed out everywhere**, on the
device they used too. They sign in again with the new password. Whoever was
signed in with the old one, the member or somebody else, has to know the new
one to get back in.

## The trade-off: an access token outlives a sign-out

This is the one real step back from the code before 2026-10-14.

**Signing out, signing out everywhere, and a reuse alarm do not stop access
tokens.** Each ends refresh tokens only. An access token already handed out
keeps working until it expires, up to 15 minutes later.

The old code stopped it on the next request. Its access token carried `sid`,
and its guard read that session's row every time. The package's access token
carries no family, and its guard reads no family.

The NestJS docs accept the same trade-off. In their words,
`signOutEverywhere()` leaves "access tokens that were already issued ...
valid until they expire, which is why they only last 15 minutes." This app
follows the docs.

What this means in practice:

- A member who signs out on a shared computer, and leaves the access token
  behind, leaves up to 15 minutes in which it works.
- A thief caught by reuse detection keeps the access token they already had,
  for up to 15 minutes.
- A thief locked out by a **password change, a reset or a closed account**
  loses the access token too, on their next request. Those three go through
  the member's row.

`JWT_EXPIRES_IN` is the lever. A shorter access token narrows the window,
and the client refreshes more often.

## What a client has to do

The only client planned is the Nuxt server. Its side of the bargain:

1. **Keep both tokens where page scripts cannot read them.** Two `httpOnly`
   cookies. See [context/frontend-architecture.md](../context/frontend-architecture.md).
2. **Send the access token with every API call.**
3. **Refresh when the access token has run out.** Either a little before
   `expiresIn` seconds have passed, or on the first 401 whose
   `WWW-Authenticate` header says `error="invalid_token"`.
4. **Keep the new refresh token from every answer**, and throw the old one
   away. The old one is spent.
5. **Send one refresh at a time for a family.** Two at once ends the family.
   Keep one pending request for each refresh token and have later callers
   wait for it.
6. **On a 401 from `/auth/token/refresh`, give up and send the member to sign
   in.** Do not retry it. Nothing will make that token work again.
7. **On sign-out, throw away the access token as well.** The server cannot
   stop it, so the client must stop using it.

## The answers when something is refused

| Answer                                                    | It means                                                        | What a client does           |
| --------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------- |
| 401 `BAD_CREDENTIALS`                                     | Wrong username, email or password at sign-in                    | Shows the sign-in error      |
| 401, `errorCode: "missing_credentials"`                   | No `Authorization: Bearer` header on a route that needs it      | Sends the member to sign in  |
| 401, `message` such as `"token expired"`                  | The access token is expired, forged or malformed                | Refreshes once, then retries |
| 401, `message: "unknown subject"`                         | The token is real, but its member is closed or changed password | Refreshes once, then retries |
| 401, `"Refresh token invalid"`, `"expired"` or `"reused"` | The refresh token cannot be swapped                             | Sends the member to sign in  |
| 403, `message: "Forbidden"`                               | A `@Can()` check said no                                        | Shows "not allowed"          |
| 400 `RESET_TOKEN_INVALID`                                 | The reset link is wrong, used or expired                        | Asks for a new link          |
| 429 `RATE_LIMITED`                                        | Too many tries. See "Rate limits" below                         | Waits for `Retry-After`      |

Every 401 from the authentication guard carries a `WWW-Authenticate` header.
With no token it is `Bearer realm="dudesphere"`. With a bad token it adds
`error="invalid_token"` and a description, as RFC 6750 describes.

**Only three app codes are left on these routes**: `BAD_CREDENTIALS`,
`RESET_TOKEN_INVALID` and `RATE_LIMITED`, in
[src/shared/error-codes.ts](../src/shared/error-codes.ts). Every other
refusal above carries the package's own body.

**A refresh tells three reasons apart now.** The old code gave one answer
for every failed refresh. The package says `invalid`, `expired` or `reused`.
A client does the same thing for all three: it sends the member to sign in.

## Passwords

**The rules for a new password.** 12 characters at least and 128 at most, as
in the docs. They apply wherever a password is set: sign-up
(`CreateUserDto`), a change at `PATCH /users/me` or an admin's
`PATCH /users/:id` (`UpdateUserDto`, built from `CreateUserDto`), and a reset
(`ResetPasswordDto`).

| Where                       | DTO                                                  | Rule            |
| --------------------------- | ---------------------------------------------------- | --------------- |
| `POST /auth/sign-up`        | [CreateUserDto](../src/users/dto/create-user.dto.ts) | 12 to 128       |
| `PATCH /users/me`, `/:id`   | [UpdateUserDto](../src/users/dto/update-user.dto.ts) | 12 to 128       |
| `POST /auth/password/reset` | [ResetPasswordDto](../src/auth/auth.dto.ts)          | 12 to 128       |
| `POST /auth/token`          | [SignInDto](../src/auth/auth.dto.ts)                 | none, not empty |

**Sign-in checks no length.** A member whose password was set when 6
characters were enough still signs in with it. The rules only stop a new
short password from being set.

**How a password is stored.** As a scrypt hash, made by the package's
`PasswordHasher`. scrypt is slow on purpose and uses a lot of memory, so a
stolen table is expensive to guess against. The hash records its own
settings, such as `$scrypt$ln=17,r=8,p=1$...`.

**Old hashes.** Before 2026-10-14 hashes were bcrypt. They still work:

1. [verifyPassword](../src/users/password-hashes.ts) checks a hash that
   starts with `$2` with bcrypt, and any other with `PasswordHasher.verify`.
2. On a right password, [CredentialsService.verify](../src/auth/credentials.service.ts)
   sees that the hash is bcrypt (`needsRehash`) and makes a scrypt hash of
   the same password.
3. [UsersRepository.replacePasswordHash](../src/users/users.repository.ts)
   stores it, but only while the stored hash is still the bcrypt one it
   checked. If the member changed their password in that tenth of a second,
   the change wins and the old password is not put back.

The password did not change, so `passwordChangedAt` stays as it was and no
token ends.

**Changing your own password** at `PATCH /users/me` needs `currentPassword`
as well. Without it a stolen access token would be enough to lock the owner
out. A wrong one is 403 `WRONG_PASSWORD`, not 401, so a client does not
treat it as a lost sign-in.

## Rate limits

[`AuthThrottlerGuard`](../src/auth/auth-throttler.guard.ts) is the docs'
guard, with three changes: it reads `identifier` as well as `email`, it adds
a second count by IP address alone, and it answers with `RATE_LIMITED`.

There are two counts, registered in
[src/app.module.ts](../src/app.module.ts):

| Count     | From          | Limit        | Counted by                                                                   |
| --------- | ------------- | ------------ | ---------------------------------------------------------------------------- |
| `default` | The docs      | 100 a minute | The account and the IP address where the body names one; else the IP address |
| `ip`      | This app only | 100 a minute | The IP address alone, and only where the body names an account               |

Two routes set a tighter `default` limit with `@Throttle()`:

| Route                                                                     | `default` limit | `ip` limit   |
| ------------------------------------------------------------------------- | --------------- | ------------ |
| `POST /auth/token`                                                        | 5 in 15 minutes | 100 a minute |
| `POST /auth/password/forgot`                                              | 3 in 15 minutes | 100 a minute |
| Any other route whose body names an account, such as `POST /auth/sign-up` | 100 a minute    | 100 a minute |
| A route whose body names no account                                       | 100 a minute    | not counted  |

A body names an account when it holds an `identifier` or an `email` that is
a string. The guard checks the body, not the route. So `PATCH /users/me` and
`PATCH /users/:id` with a new email, and an admin's `POST /users`, are counted
by the `ip` count too, and their `default` count is by account and IP.

A request must pass both counts. `AuthThrottlerGuard.handleRequest` runs once
for each count. For `default` it hands over to the docs' tracker,
`getTracker`. For `ip` it skips a request whose body names no account, and
otherwise counts it by the IP address alone.

The identifier and the email are trimmed and lowercased first, so
`Ada@Example.com ` and `ada@example.com` share one count.

**Why the second count.** The docs' guard counts a request that names an
account by that account and the address together, and nothing else. So one
IP address that named a new email on each request would never be refused. It
could try one password against every account, or send reset emails to every
address. The `ip` count stops that at 100 a minute, however many accounts
the address names.

Each count sends its own headers on a request it lets through. The `ip`
count's end in `-ip`, such as `X-RateLimit-Remaining-ip`. A request the `ip`
count refuses gets `Retry-After-ip` from `@nestjs/throttler`, as well as the
`Retry-After` that `AuthThrottlerGuard` sets on every refusal.

**A username and an email are counted apart.** The guard sees only what was
typed. So one account gets 5 tries by username and 5 more by email.

The counts are kept in the app's memory. They reset on a restart, and two
copies of the app do not share them.

## Why it is built this way

**Why the packages, after building it by hand?**
The NestJS team publishes `@nestjs/authentication` and
`@nestjs/authorization`, and the docs teach them. Code that follows the docs
can be compared line by line with the docs, and the package's own tests
check the store. The cost is the trade-off above: the package does not stop
an access token with its family. When version 0.1.0 came out, that cost was
the reason this app stayed by hand. On 2026-10-14 it moved to the package
and accepted the cost.

**Why is the refresh token random text and not a second JWT?**
The course signs a second JWT. A random token is simpler and safer here:

- It cannot be mistaken for an access token. Random text is refused by its
  shape. Sent as a bearer token, it gets 401.
- It has to be looked up in the table anyway, to see whether it was used. So
  a signature would add nothing.

**Why store a hash and not the token?**
Because a database gets read by more people than it should: backups, logs,
a careless query. A hash is useless to all of them.

**Why SHA-256 and not scrypt, as for passwords?**
scrypt is slow on purpose, to make guessing a short password costly. A token
is 32 random bytes. There is nothing to guess, so a fast hash is enough, and
a fast hash can be found by an index.

**Why scrypt and not bcrypt for passwords now?**
`PasswordHasher` is the package's, and it uses scrypt, which Node has built
in. Old bcrypt hashes still work: `verifyPassword` checks them with bcrypt,
and `CredentialsService.verify` stores a scrypt hash the next time the
member signs in. Once no `user.password` starts with `$2`,
[src/users/password-hashes.ts](../src/users/password-hashes.ts) and the
bcrypt package can go.

**Why is `revoked` on every row, and not on a family table?**
The docs build it this way. A family counts as revoked when any of its rows
is. That also covers a successor saved a moment after a sign-out, by a
refresh that lost the race: `isRefreshTokenFamilyRevoked` still finds a
revoked row in the family.

**How long are rows kept?**
Not long. There is no 180-day record any more.

- A `refresh_tokens` row stays until its family's 30-day end. Then it is
  deleted, revoked or not.
- An `email_tokens` row is deleted when its link is used. One that expired
  is deleted the next time any link is saved.

**Who cleans the tables up?**
The store, as it writes. `TypeOrmAuthenticationStore.saveRefreshToken`
saves the new row, then deletes every row whose `family_expires_at` has
passed, whoever it belongs to. So the table is cleaned whenever someone
signs in or refreshes, which is also the only time it grows.
`saveEmailToken` does the same for expired links, and keeps at most 100,000
pending links.

**How long is a spent token remembered?**
For as long as its family's rows exist: until the family's 30-day end. While
the family is going, a second use of a spent token revokes the family,
however late it comes.

**Does Postgres not delete old rows by itself?**
No. Postgres has no setting to expire a row after a time, as Redis and a
MongoDB TTL index do. What it does by itself is `VACUUM`, and that is a
different job: it frees the space of rows the app already deleted. If the
app sat idle, old rows would wait until the next sign-in. That costs a
little disk and nothing else, because such a row cannot be used.

**How big does the table get?**
A family gains a row with every refresh. A client that refreshed every 15
minutes around the clock would write 96 rows a day, and hold at most about
2,900 rows for one family: 30 days of them. A client that refreshes only
while it is in use holds far fewer.

**Why does every time come from the app's clock?**
The access token's `iat` is written by the app. `passwordChangedAt` is
compared with it, so it is written by the app too, with `utcNowOrThrow`. If
it came from the database's clock, two machines a second apart could refuse
a member's new token straight after a reset. The package passes JavaScript
`Date`s to the store, and the store turns each into an ISO string at once,
so no `Date` reaches the rest of the app.

**Why is a token from the same second as a password change let through?**
A JWT records only the second it was signed in. A token from that second is
far more often the member signing in straight after a reset than an old
token. `signedAfterPasswordChange` in
[src/auth/jwt-auth.provider.ts](../src/auth/jwt-auth.provider.ts) refuses
any earlier second.

## The settings

All lifetimes are in seconds.
[src/config/env.validate.ts](../src/config/env.validate.ts) holds the rules,
and [src/auth/config/auth.config.ts](../src/auth/config/auth.config.ts)
passes them on.

| Variable                            | Default          | That is    | Rule                                     | Package option             |
| ----------------------------------- | ---------------- | ---------- | ---------------------------------------- | -------------------------- |
| `JWT_EXPIRES_IN`                    | `900`            | 15 minutes | At least 1                               | `accessToken.ttl`          |
| `REFRESH_TOKEN_EXPIRES_IN`          | `604800`         | 7 days     | At least 60                              | `refreshToken.ttl`         |
| `REFRESH_TOKEN_ABSOLUTE_EXPIRES_IN` | `2592000`        | 30 days    | Not less than `REFRESH_TOKEN_EXPIRES_IN` | `refreshToken.absoluteTtl` |
| `PASSWORD_RESET_EXPIRES_IN`         | `1800`           | 30 minutes | At least 60                              | `passwordReset.ttl`        |
| `JWT_SECRET`                        | none             |            | At least 32 characters                   | `accessToken.key`          |
| `JWT_AUDIENCE`                      | `dudesphere-api` |            |                                          | `accessToken.audience`     |
| `JWT_ISSUER`                        | `dudesphere`     |            |                                          | `accessToken.issuer`       |

`AppModule` passes each lifetime to the package as `"<n>s"`. The package
reads a bare number as milliseconds.

`SESSION_EXPIRES_IN` and `SESSION_RETENTION` are gone. An env file that
still sets them is not refused: the app ignores both. Move a
`SESSION_EXPIRES_IN` value to `REFRESH_TOKEN_ABSOLUTE_EXPIRES_IN`.

An env file that sets one of these wins over the default.

## Where the code is

| File                                                                                              | Its job                                                                                   |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [src/app.module.ts](../src/app.module.ts)                                                         | Registers both packages with their options, and `AuthThrottlerGuard`                      |
| [src/auth/auth.module.ts](../src/auth/auth.module.ts)                                             | The app's parts: four controllers, `JwtAuth`, `CredentialsService`, the mailer, the store |
| [src/auth/tokens.controller.ts](../src/auth/tokens.controller.ts)                                 | `POST /auth/token`, `/auth/token/refresh`, `/auth/token/revoke`                           |
| [src/auth/sessions.controller.ts](../src/auth/sessions.controller.ts)                             | `POST /auth/sign-out-everywhere`                                                          |
| [src/auth/auth.controller.ts](../src/auth/auth.controller.ts)                                     | `POST /auth/sign-up`                                                                      |
| [src/auth/password-reset.controller.ts](../src/auth/password-reset.controller.ts)                 | `POST /auth/password/forgot` and `/auth/password/reset`                                   |
| [src/auth/credentials.service.ts](../src/auth/credentials.service.ts)                             | `verify`: checks a password at sign-in, and upgrades a bcrypt hash                        |
| [src/auth/jwt-auth.provider.ts](../src/auth/jwt-auth.provider.ts)                                 | `JwtAuth.validate`: loads the member on every signed-in request                           |
| [src/auth/password-reset.mailer.ts](../src/auth/password-reset.mailer.ts)                         | Finds the account, sends the reset email, stores the new hash                             |
| [src/auth/auth.dto.ts](../src/auth/auth.dto.ts)                                                   | `SignInDto`, `RefreshTokenDto`, `EmailDto`, `ResetPasswordDto`                            |
| [src/auth/auth-throttler.guard.ts](../src/auth/auth-throttler.guard.ts)                           | Rate limits, by account and address                                                       |
| [src/auth/auth-types.ts](../src/auth/auth-types.ts)                                               | Tells the package that a signed-in user is a `User`                                       |
| [src/auth/config/auth.config.ts](../src/auth/config/auth.config.ts)                               | The settings, read from the environment                                                   |
| [src/typeorm/authentication.entities.ts](../src/typeorm/authentication.entities.ts)               | The `sessions`, `refresh_tokens` and `email_tokens` tables                                |
| [src/typeorm/typeorm-authentication.store.ts](../src/typeorm/typeorm-authentication.store.ts)     | Every query on those tables. It decides nothing                                           |
| [src/users/users.repository.ts](../src/users/users.repository.ts)                                 | `findById`, `findCredentials`, `updatePasswordHash`, `replacePasswordHash`                |
| [src/users/password-hashes.ts](../src/users/password-hashes.ts)                                   | Checks a bcrypt or scrypt hash                                                            |
| [src/users/users.service.ts](../src/users/users.service.ts)                                       | `endSignIns`, on a password change, a closed account and a restore                        |
| [src/users/user.policy.ts](../src/users/user.policy.ts)                                           | Who may manage other members: admins only                                                 |
| [src/hashtags/hashtag.policy.ts](../src/hashtags/hashtag.policy.ts)                               | Who may delete and restore hashtags: admins only                                          |
| [test/tokens.e2e-spec.ts](../test/tokens.e2e-spec.ts)                                             | The flows in this document, over real HTTP and the real database                          |
| [test/typeorm-authentication.store.e2e-spec.ts](../test/typeorm-authentication.store.e2e-spec.ts) | The package's own test suite, run against this app's store                                |

`TokenService`, `SignInService`, `PasswordResetService`, `PasswordHasher`,
`JwtSigner` and both guards are in the packages, under
`node_modules/@nestjs/authentication` and `node_modules/@nestjs/authorization`.
The app never edits them.

## How the course lessons map

The course covers refresh tokens in lessons 99 to 103.

| Lesson                   | In the course                           | Here                                                       |
| ------------------------ | --------------------------------------- | ---------------------------------------------------------- |
| 100, sign token          | `signToken`, used for both tokens       | `JwtSigner.sign`, inside `TokenService`. Access token only |
| 101, generate tokens     | Returns `{ token, refreshToken }`       | `TokenService.issue`, called by `TokensController.issue`   |
| 102, refresh token API   | `POST /auth/refresh-token`              | `POST /auth/token/refresh`, `RefreshTokenDto`              |
| 103, refresh token logic | Verify the JWT, load the user, re-issue | `TokenService.refresh`, six checks                         |

Three things differ from the course, all by choice:

- **The paths follow the NestJS docs**: `/auth/token`, where the course signs
  in at `/auth/login`.
- **The answer's keys follow the NestJS docs**: `accessToken`, where the
  course has `token`.
- **The refresh token is opaque and stored.** The course's is a second JWT
  that the server does not store, so it cannot be ended, and using it twice
  goes unnoticed.

## Try it by hand

The examples use port 3000. Use the `PORT` from your `.env`. They need `jq`.

Sign in and keep the pair:

```bash
PAIR=$(curl -s -X POST http://localhost:3000/auth/token \
  -H "Content-Type: application/json" \
  -d '{"identifier":"walter","password":"a-long-secret-123"}')

ACCESS=$(echo "$PAIR" | jq -r .accessToken)
REFRESH=$(echo "$PAIR" | jq -r .refreshToken)
```

Use the access token:

```bash
curl -s http://localhost:3000/users/me -H "Authorization: Bearer $ACCESS"
```

Look inside it:

```bash
echo "$ACCESS" | jq -R 'split(".")[1] | @base64d | fromjson'
```

That decodes the middle part. It checks nothing: anyone can read a JWT, and
only the server can verify one.

Refresh, and keep the new pair:

```bash
NEXT=$(curl -s -X POST http://localhost:3000/auth/token/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH\"}")

NEW_ACCESS=$(echo "$NEXT" | jq -r .accessToken)
NEW_REFRESH=$(echo "$NEXT" | jq -r .refreshToken)
```

Now play the thief. Send the old refresh token a second time:

```bash
curl -s -X POST http://localhost:3000/auth/token/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH\"}"
# 401 "Refresh token reused"

curl -s http://localhost:3000/users/me -H "Authorization: Bearer $NEW_ACCESS"
# 200: the family is over, and the access token runs out by itself
```

What each step answers. `test/tokens.e2e-spec.ts` checks every row but
"The first access token, after that refresh". No test sends that token again
after a refresh:

| Step                                          | Answer                                     |
| --------------------------------------------- | ------------------------------------------ |
| Sign in                                       | 200, with the three keys                   |
| `GET /users/me` with the access token         | 200                                        |
| Refresh                                       | 200, with a new pair                       |
| The first access token, after that refresh    | 200, until it expires                      |
| The old refresh token, sent again             | 401 `"Refresh token reused"`               |
| The newest refresh token, after that          | 401 `"Refresh token invalid"`              |
| The newest access token, after that           | 200, until it expires                      |
| Sign in again, then `POST /auth/token/revoke` | 204                                        |
| That family's access token                    | 200, until it expires                      |
| `revoke` with a made-up token                 | 204                                        |
| Sign in again, then `sign-out-everywhere`     | 204, and every refresh token then gets 401 |

To watch the table while you do it, in pgAdmin or `psql`:

```sql
SELECT left("id", 8) AS hash, left("family_id", 8) AS family, "user_id",
       "used_at", "expires_at", "family_expires_at", "revoked"
FROM "refresh_tokens"
ORDER BY "created_at" DESC
LIMIT 10;
```

`pnpm dev:token` is still the easy way to try other routes.
[src/dev/dev-token.ts](../src/dev/dev-token.ts) signs a token with the
package's `JwtSigner` and the app's own `accessToken` options, so `JwtAuth`
accepts it like any other. It lasts 30 days, has no refresh token and
belongs to no family. Only the app's key can sign one.

## What it does not do

- **A sign-out does not stop an access token.** It works until it expires,
  up to 15 minutes. See "The trade-off" above.
- **No list of "your devices".** A member can sign out everywhere, but
  cannot see their sign-ins or pick one to end. The docs' list is for
  browser sessions, which this API does not use.
- **No cookies.** The API is bearer-only. The Nuxt server will hold the
  cookies.
- **No notice and no log** when a family ends because a token was used
  twice. The package emits a `refresh-token-reused` event, and nothing here
  listens for it.
- **No recheck after sign-in.** The old `AuthService.login` checked the
  password a second time once the session existed. Nothing does now. A
  sign-in that starts with the old password, a tenth of a second before a
  password change finishes, can end with a family the change did not reach.
  It needs the old password, and the timing cannot be forced.
- **A password change and the end of its families are two writes.** If the
  second fails, the old refresh tokens keep working. See "Everything that
  ends a sign-in".
- **A restored account can bring back a recent access token.** Closing an
  account stops its access tokens because `JwtAuth.validate` finds nobody.
  Restoring it makes the member findable again, so an access token signed
  less than 15 minutes before the close works again until it expires. The
  restore does end every family.
- **A sign-out does not stop a `pnpm dev:token` token.** It belongs to no
  family, so there is nothing to end. It lasts its 30 days unless the
  account is closed or its password changes. The command refuses to run in
  production, and does run on staging.
- **No real delete of a user.** The token tables have no foreign key to
  `user`, so Postgres would not stop one. A feature that erases an account
  must delete the member's rows in `refresh_tokens`, `email_tokens` and
  `sessions` first.
- **No cleanup without traffic.** Old rows are deleted when someone signs in
  or refreshes. There is no scheduled job.

## Further reading

- NestJS docs, [Authentication](https://docs.nestjs.com/security/authentication):
  "Issue tokens to the mobile app", "Let customers manage their sessions",
  "Rate-limit sign-in" and "Keep sessions and tokens in your database" are
  the sections this app follows.
- NestJS docs, [Authorization](https://docs.nestjs.com/security/authorization):
  policies, `@Can()` and `before()`.
- [RFC 7519](https://www.rfc-editor.org/rfc/rfc7519): what a JWT is, and what
  `sub`, `iat`, `exp`, `aud`, `iss` and `jti` mean.
- [RFC 6750](https://www.rfc-editor.org/rfc/rfc6750): bearer tokens, and the
  `WWW-Authenticate` header on a 401.
- [RFC 7009](https://www.rfc-editor.org/rfc/rfc7009): token revocation.
  Section 2.2 is why `/auth/token/revoke` answers the same for an unknown
  token.
- [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700): OAuth security best
  practice. Section 4.14 covers refresh token rotation and reuse detection.
