# Token FYI

The short version of how tokens work in this code. Each step names the file
and the method, so you can open it and read along.
[TOKENS_AND_SESSIONS.md](./TOKENS_AND_SESSIONS.md) is the long version, with
the reasons and a table of old names and new ones.

## What changed on 2026-10-14

- **The auth now runs on two official packages**: `@nestjs/authentication`
  0.1.1 signs members in, and `@nestjs/authorization` 0.1.0 decides what
  they may do. The app is set up the way the NestJS docs show.
- **The routes have the docs' names.** Sign in is `POST /auth/token`, not
  `/auth/login`. The long version has the full map.
- **One sign-in is now a "family" of refresh tokens**, not a row in a
  `session` table. That table is gone.
- **Bad news: signing out no longer stops the access token.** It keeps
  working until it expires, up to 15 minutes. Before, it stopped on the next
  request. The docs accept this. A password change, a password reset and a
  closed account still stop it at once.

## The picture in one minute

- **A sign-in makes a family.** One sign-in on one device is one family of
  refresh tokens. They share a `family_id`.
- **A family has refresh tokens.** Its first one, and one more each time it
  is renewed. Each is a row in `refresh_tokens`.
- **The access token names the member, and nothing else.** It is a JWT, and
  it carries the member's id. It does not say which family it came from.

```text
user ──< family ──< refresh_tokens row
            (rows that share a family_id)

access token ──► user id only (`sub`). No family.
```

Read `──<` as "has many". A member has many families, and a family has many
refresh tokens.

Whether a family is still good is on its rows. Whether an access token is
still good is on the member's own row in `user`.

## Three tokens, two jobs

This app has three tokens. Two of them work together to keep a member signed
in. The third has a different job: it lets a member who **cannot** sign in
choose a new password.

| Token                | Its job                                               |
| -------------------- | ----------------------------------------------------- |
| Access token         | Proves who is calling, on every request               |
| Refresh token        | Gets a new access token when the old one runs out     |
| Password reset token | Lets a member who forgot their password set a new one |

The refresh token and the password reset token look the same: both are 43
random characters, made and hashed by the same package functions. That is
where the likeness ends. They live in different tables, last for different
times, and are used up in different ways.

## The three tokens, side by side

|                          | Access token                      | Refresh token                                          | Password reset token              |
| ------------------------ | --------------------------------- | ------------------------------------------------------ | --------------------------------- |
| What it is               | A JWT, signed with `JWT_SECRET`   | 43 random characters. Not a JWT                        | 43 random characters. Not a JWT   |
| What is in it            | The user's id, and `amr: ["pwd"]` | Nothing. It is a key to a row                          | Nothing. It is a key to a row     |
| How the member gets it   | In the answer to a sign-in        | In the same answer                                     | By email, inside a link           |
| Where it is sent back    | `Authorization: Bearer` header    | Body of `/auth/token/refresh` and `/auth/token/revoke` | Body of `/auth/password/reset`    |
| How long it lasts        | 15 minutes                        | 7 days, and 30 days for its whole family               | 30 minutes                        |
| How many times it works  | Any number, until it expires      | Once                                                   | Once                              |
| What the server keeps    | Nothing                           | A SHA-256 hash, in `refresh_tokens`                    | A SHA-256 hash, in `email_tokens` |
| Its row after it is used | There is no row                   | Kept until the family's 30-day end                     | Deleted at once                   |
| Does a sign-out stop it? | **No. It runs out by itself**     | Yes, at once                                           | No. A sign-out does not touch it  |
| Does it sign anyone in?  | It is the proof of sign-in        | It renews a sign-in                                    | No. It only changes the password  |

There are no cookies. The API reads the header and the body, and nothing
else.

## Three tables, side by side

The access token has no table: the server stores nothing for it. The package
keeps three tables. Only two of them ever get rows.

|                       | `refresh_tokens`                      | `email_tokens`                            | `sessions`                               |
| --------------------- | ------------------------------------- | ----------------------------------------- | ---------------------------------------- |
| What one row is       | One refresh token that was handed out | One reset link that can still be used     | One browser signed in with a cookie      |
| Rows in this app      | One for each sign-in and each refresh | Normally none, or one while a link is out | **None, ever.** This API uses no cookies |
| Its key               | `id`, the hash of the token           | `id`, the hash of the token               | `id`, the hash of the cookie             |
| How rows group        | By `family_id`: one sign-in           | By `user_id` and `purpose`                | By `user_id`                             |
| How it is "used up"   | `used_at` is set. The row stays       | The row is deleted                        | Not used here                            |
| How it is ended early | `revoked` is set on the whole family  | A new email or password on the account    | Not used here                            |
| When a row is deleted | After the family's 30-day end         | When used, or soon after it expires       | Not used here                            |
| Link to `user`        | `user_id`, text, no foreign key       | `user_id`, text, no foreign key           | `user_id`, text, no foreign key          |

All three are in
[authentication.entities.ts](../src/typeorm/authentication.entities.ts), and
[TypeOrmAuthenticationStore](../src/typeorm/typeorm-authentication.store.ts)
runs every query on them.

**How to tell them apart in one line:** `refresh_tokens` says which keys to
each sign-in were handed out and whether the sign-in still holds,
`email_tokens` forgets a link the moment it is used, and `sessions` is there
because the package needs it, and stays empty.

**Why keep an empty table?** A password reset and a sign-out-everywhere end
a member's sessions as well as their families. The package needs a place to
look, even when there is nothing there.

## Look-alike words

| Word                | What it means now                                                 | What it meant before 2026-10-14    |
| ------------------- | ----------------------------------------------------------------- | ---------------------------------- |
| Sign in             | Swap a password for a pair, at `POST /auth/token`                 | "Log in", at `POST /auth/login`    |
| Family              | Every refresh token of one sign-in                                | The same idea, called a session    |
| Session             | A browser cookie sign-in, in `sessions`. Unused here              | One sign-in, a row in `session`    |
| Revoke              | End a family: set `revoked` on its rows                           | End a session: set its `revokedAt` |
| Sign out            | `POST /auth/token/revoke`: ends one family                        | "Log out", at `POST /auth/logout`  |
| Sign out everywhere | `POST /auth/sign-out-everywhere`: ends every family of the member | `POST /auth/logout-all`            |

## Where the code is

```text
src/app.module.ts                registers both packages, and AuthThrottlerGuard
src/auth/
  auth.module.ts                 the app's parts of sign-in, listed in one module
  tokens.controller.ts           sign in, refresh, sign out this device
  sessions.controller.ts         sign out everywhere
  auth.controller.ts             sign up
  password-reset.controller.ts   forgot password, reset password
  credentials.service.ts         checks a password at sign-in
  jwt-auth.provider.ts           JwtAuth: loads the member on every request
  password-reset.mailer.ts       finds the account, sends the email, stores the hash
  auth.dto.ts                    every /auth request body
  auth-throttler.guard.ts        rate limits
  config/auth.config.ts          the lifetimes and the secret
src/typeorm/
  authentication.entities.ts     the three tables
  typeorm-authentication.store.ts  every query on them. It decides nothing
src/users/
  users.repository.ts            findById, findCredentials, updatePasswordHash,
                                 replacePasswordHash
  password-hashes.ts             checks a bcrypt or a scrypt hash
  user.policy.ts                 who may manage other members
src/hashtags/hashtag.policy.ts   who may delete and restore hashtags
```

The rules themselves are in the packages: `TokenService`, `SignInService`,
`PasswordResetService`, `PasswordHasher`, and both guards. The app calls
them, and never edits them.

Each route, its request body, and the method it ends up in:

| Route                            | Body               | Controller method                      | Then                                              |
| -------------------------------- | ------------------ | -------------------------------------- | ------------------------------------------------- |
| `POST /auth/sign-up`             | `CreateUserDto`    | `AuthController.signUp`                | `UsersService.createUser`                         |
| `POST /auth/token`               | `SignInDto`        | `TokensController.issue`               | `CredentialsService.verify`, `TokenService.issue` |
| `POST /auth/token/refresh`       | `RefreshTokenDto`  | `TokensController.refresh`             | `TokenService.refresh`                            |
| `POST /auth/token/revoke`        | `RefreshTokenDto`  | `TokensController.revoke`              | `TokenService.revoke`                             |
| `POST /auth/sign-out-everywhere` | none               | `SessionsController.signOutEverywhere` | `SignInService.signOutEverywhere`                 |
| `POST /auth/password/forgot`     | `EmailDto`         | `PasswordResetController.forgot`       | `PasswordResetService.request`                    |
| `POST /auth/password/reset`      | `ResetPasswordDto` | `PasswordResetController.reset`        | `PasswordResetService.reset`                      |

## The six flows

### 1. Sign in: `POST /auth/token`

1. `AuthThrottlerGuard` counts the try. Five in 15 minutes are allowed for
   one identifier from one IP address
   ([auth-throttler.guard.ts](../src/auth/auth-throttler.guard.ts)).
2. `TokensController.issue` takes `{ identifier, password }`
   ([tokens.controller.ts](../src/auth/tokens.controller.ts)).
3. `CredentialsService.verify` finds the member with
   `UsersRepository.findCredentials` and checks the password with
   `verifyPassword`
   ([credentials.service.ts](../src/auth/credentials.service.ts)). If the
   stored hash is the old bcrypt kind, it stores a scrypt hash of the same
   password.
4. A wrong identifier or password is 401 `BAD_CREDENTIALS`.
5. `TokenService.issue` (in the package) starts a **family**: a new
   `family_id`, and an end 30 days away. It makes a random refresh token, and
   `TypeOrmAuthenticationStore.saveRefreshToken` saves a **row** holding its
   hash and the family id. Then it signs the JWT, with the member's id as
   `sub`.
6. The answer is `{ accessToken, refreshToken, expiresIn }`.

### 2. An ordinary request

Three global guards run first, in this order:

1. **`AuthThrottlerGuard`**: 100 requests a minute from one IP address.
   Over that is 429.
2. **The authentication guard** (from `AuthenticationModule`, in
   `app.module.ts`): who is calling?
   - No `Authorization: Bearer` header on a route that is not `@Public()`:
     401 `missing_credentials`.
   - The package checks the JWT's signature, algorithm, expiry, issuer and
     audience. No database.
   - `JwtAuth.validate` reads the member by `sub`
     ([jwt-auth.provider.ts](../src/auth/jwt-auth.provider.ts)). It refuses a
     closed account, and a token signed before the member's last password
     change. That is one query.
   - If all pass, the member becomes `request.user`.
3. **The authorization guard** (from `AuthorizationModule`): may this caller
   use this route?
   - `@Public()` or `@Can.Anyone()`: yes.
   - `@Can(UserPolicy, "viewAll")`: asks
     [UserPolicy](../src/users/user.policy.ts). An admin gets through;
     anyone else gets 403.
   - Nothing declared: no. The route is closed.

Then `@CurrentUser()` hands `request.user` to the controller method.

**Authentication answers 401, authorization answers 403.** 401 means "I do
not know who you are". 403 means "I know who you are, and you may not".

### 3. Refresh: `POST /auth/token/refresh`

All of it is `TokenService.refresh`, in the package.
`TypeOrmAuthenticationStore.getRefreshToken` fetches the token's row. Then
it refuses with 401 at the first check that fails:

1. Is it shaped like one of our tokens? (Checked before the query.)
2. Is there a row for its hash, in a family that is not revoked?
   (`"Refresh token invalid"`)
3. Is it inside its own 7 days, and its family's 30? (`"expired"`)
4. Is the row unused? **If it was used before, revoke the whole family**
   (`"reused"`).
5. Save the new token, then mark the old one used
   (`markRefreshTokenUsed`).

The client gets a new pair and throws the old refresh token away. No new
family is made: a refresh renews a sign-in, it never starts one.

### 4. Sign out

- **This device:** `POST /auth/token/revoke` → `TokensController.revoke` →
  `TokenService.revoke` → `TypeOrmAuthenticationStore.revokeRefreshTokenFamily`.
  It sets `revoked` on every row of that one family. Always 204.
- **Every device:** `POST /auth/sign-out-everywhere` →
  `SessionsController.signOutEverywhere` →
  `SignInService.signOutEverywhere` → `TokenService.revokeAll` →
  `TypeOrmAuthenticationStore.revokeUserRefreshTokens`. The same, for every
  family the member has now. Needs the access token.

The refresh tokens stop at once. **The access tokens do not.** Nothing about
a sign-out is on the member's row, and `JwtAuth.validate` reads only that
row. So each access token works until its own 15 minutes are up.

### 5. Cleanup

There is no scheduled job. Each time a refresh token is saved,
`TypeOrmAuthenticationStore.saveRefreshToken` deletes every row whose family
has passed its 30-day end. Each time a reset link is saved,
`saveEmailToken` deletes the links that expired. So the tables are cleaned
whenever someone signs in, refreshes or asks for a link.

### 6. Forgot password: the third token

This flow has its own token, its own table and its own route. It makes no
family and hands out no access token. The package does most of it. The app's
half is [PasswordResetMailer](../src/auth/password-reset.mailer.ts).

The table is `email_tokens`. Its key columns:

| Column        | In plain words                                                |
| ------------- | ------------------------------------------------------------- |
| `id`          | The hash of the token in the link                             |
| `user_id`     | Whose link it is                                              |
| `email`       | The address it went to. A new address on the account kills it |
| `fingerprint` | A hash of the password hash. A new password kills the link    |
| `expires_at`  | When the link stops working (30 minutes)                      |

**Asking for the link:** `POST /auth/password/forgot` with `{ email }`.

1. `AuthThrottlerGuard` allows 3 in 15 minutes for one email from one IP
   address.
2. `PasswordResetController.forgot` calls `PasswordResetService.request` and
   does not wait for it
   ([password-reset.controller.ts](../src/auth/password-reset.controller.ts)).
   The answer is 202 every time, so it does not reveal whether the email has
   an account.
3. `PasswordResetMailer.findUser` looks the member up with
   `UsersRepository.findCredentials`. If there is none, it stops.
4. The package makes a token and saves its hash, the email and the
   fingerprint, with an `expires_at` 30 minutes away.
5. `PasswordResetMailer.send` emails
   `<FRONTEND_URL>/reset-password?token=<token>`.

Asking again sends a new link, and **the earlier link keeps working** until
one of them is used. That is new: before, only the newest link worked.

**Using the link:** `POST /auth/password/reset` with `{ token, password }`.
There is no `confirmPassword` any more. Typing the password twice is the web
page's job.

1. `PasswordResetController.reset` calls `PasswordResetService.reset`.
2. `TypeOrmAuthenticationStore.consumeEmailToken` runs one statement:
   `DELETE` the row with that hash, and return it. **Deleting the row is how
   the token is used.** It cannot work twice, because the row is gone.
3. The package checks the link has not expired, and that the account still
   has the same email and the same password hash.
4. `PasswordHasher` hashes the new password with scrypt.
5. The package ends every family the member has. Then
   `PasswordResetMailer.updatePassword` stores the hash and stamps
   `passwordChangedAt`. Then the package deletes the member's other links,
   and ends the families once more.
6. The answer is 204 with no body. No tokens come back. The member now signs
   in with the new password, which is flow 1.

A wrong, used or expired link gets 400 `RESET_TOKEN_INVALID`, one answer for
all three.

**Where the two worlds touch:** only at step 5. A reset ends the member's
families, so every refresh token they held stops. `passwordChangedAt` makes
every access token they held stop too.

## What ends what

| What happened                                | Refresh tokens     | Access tokens                    |
| -------------------------------------------- | ------------------ | -------------------------------- |
| Sign out on one device                       | That family stops  | **Work until they expire**       |
| Sign out everywhere                          | Every family stops | **Work until they expire**       |
| A refresh token used twice                   | That family stops  | **Work until they expire**       |
| A password change, by the member or an admin | Every family stops | Stop on the next request         |
| A password reset                             | Every family stops | Stop on the next request         |
| The account closed                           | Every family stops | Stop on the next request         |
| The account restored by an admin             | Every family stops | Work again until they expire     |
| 30 days since the sign-in                    | That family stops  | The last one runs its 15 minutes |

The access-token column follows one rule. `JwtAuth.validate` reads the
member's row on every request. What changes that row (a new
`passwordChangedAt`, or `deletedAt` being set) stops access tokens at once.
What changes only `refresh_tokens` does not.

## Questions, with short answers

**1. What is a family?**
Every refresh token of one sign-in on one device. They are rows in
`refresh_tokens` that share a `family_id`. A family is over when it is
revoked, or 30 days have passed since the sign-in.

**2. What is a session, then?**
In this app now, a row in the `sessions` table: a browser signed in with a
cookie. This API never makes one, so the table is empty. Older notes use
"session" for what is now a family.

**3. Why two tokens and not one?**
The token sent with every request is the one most likely to leak, so it is
short-lived. The long-lived one is sent rarely, so the member is not asked
for a password every 15 minutes.

**4. Why is the refresh token not a JWT?**
The server has to look it up anyway, to see whether it was used. A signature
would add nothing. Random text also cannot be mistaken for an access token.

**5. Why store a hash of it?**
So someone who reads the table, or a backup of it, finds nothing they can
use.

**6. Why SHA-256 and not scrypt?**
scrypt is slow to make short passwords costly to guess. A token is 32 random
bytes, so there is nothing to guess, and a fast hash can be found by an
index.

**7. Why does a refresh token work only once?**
So a stolen one is noticed. If a spent token comes back, two parties hold
it.

**8. What happens when one is used twice?**
The family is revoked. The server cannot tell the thief from the member, so
both lose their refresh tokens, and only the member knows the password. The
thief's access token still works for up to 15 minutes.

**9. A JWT cannot be cancelled. Does signing out stop it?**
No. A sign-out ends the refresh tokens only. The access token works until it
expires, up to 15 minutes. The old code stopped it at once, by putting the
session id in the token and reading the session on every request. The
package does not, and the NestJS docs accept that. Keep access tokens short.

**10. Then how does a password change stop it?**
`JwtAuth.validate` reads the member on every request, and compares the
token's `iat` with the member's `passwordChangedAt`. A token signed in an
earlier second is refused. A closed account is not found at all.

**11. Why is there no role in the JWT?**
A token cannot change after it is signed. A role in it would be wrong the
moment an admin is demoted. The policies read the role from the member that
`JwtAuth.validate` loaded.

**12. What if two requests send the same refresh token at the same moment?**
One `UPDATE ... WHERE "used_at" IS NULL` decides. Postgres lets one of them
change the row. The other changes nothing, counts as a second use, and the
family is revoked.

**13. What is the difference between 401 and 403?**
401 comes from the authentication guard: no token, or one that does not
work. 403 comes from the authorization guard: the member is known, and a
`@Can()` check said no.

**14. How long are rows kept?**
A refresh token's row stays until its family's 30-day end. A reset link's
row goes when it is used, or soon after it expires. There is no 180-day
record any more.

**15. How is the password reset token different from the refresh token?**
They are the same kind of string, hashed the same way. Everything else
differs. The refresh token keeps a signed-in member signed in, lasts 7 days,
and leaves a row behind until its family ends. The reset token is for
someone who cannot sign in, arrives by email, lasts 30 minutes, and its row
is deleted the moment it is used.

**16. Does resetting a password sign the member in?**
No. The reset answers 204 with no tokens, and ends every family the member
had. They sign in again with the new password.

**17. What is `pnpm dev:token`?**
A 30-day access token for trying routes by hand. It is signed with the
app's own key and options, so `JwtAuth` accepts it. It has no refresh token
and no family, so a sign-out cannot end it. A password change or a closed
account still does.
