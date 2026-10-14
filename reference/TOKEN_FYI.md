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
- **Signing out still stops the access token on the next request.** Every
  access token carries its sign-in's id, `sid`, and `JwtAuth` checks it on
  every request. The docs do not do this: there, an access token works until
  it expires. The app adds one column and one check for it.
- **A password change and the end of its sign-ins are one transaction**, so
  one never happens without the other. Not in the docs either.
- **Sign-in checks the password once more** after the new sign-in has
  started, in case it changed in the meantime. Not in the docs either.
- **A new password is 12 characters at least**, as in the docs. It was 6.
  Sign-in still takes a shorter one that was set before.
- **Passwords are hashed with scrypt** now. An old bcrypt hash still signs
  in, and is replaced with a scrypt one at that sign-in.

## The picture in one minute

- **A sign-in makes a family.** One sign-in on one device is one family of
  refresh tokens. They share a `family_id`.
- **A family has refresh tokens.** Its first one, and one more each time it
  is renewed. Each is a row in `refresh_tokens`.
- **The access token names the member and the sign-in.** It is a JWT. It
  carries the member's id, `sub`, and the sign-in's id, `sid`. Every row of
  the family holds the same `sid`.

```text
user ──< family ──< refresh_tokens row
            (rows that share a family_id and a sid)

access token ──► user id (`sub`) and sign-in id (`sid`)
```

Read `──<` as "has many". A member has many families, and a family has many
refresh tokens.

Whether a family is still good is on its rows. Whether an access token is
still good is on two places: the member's own row in `user`, and its
family's rows in `refresh_tokens`, found by `sid`.

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

|                          | Access token                                     | Refresh token                                          | Password reset token              |
| ------------------------ | ------------------------------------------------ | ------------------------------------------------------ | --------------------------------- |
| What it is               | A JWT, signed with `JWT_SECRET`                  | 43 random characters. Not a JWT                        | 43 random characters. Not a JWT   |
| What is in it            | The user's id, `amr: ["pwd"]` and `sid`          | Nothing. It is a key to a row                          | Nothing. It is a key to a row     |
| How the member gets it   | In the answer to a sign-in                       | In the same answer                                     | By email, inside a link           |
| Where it is sent back    | `Authorization: Bearer` header                   | Body of `/auth/token/refresh` and `/auth/token/revoke` | Body of `/auth/password/reset`    |
| How long it lasts        | 15 minutes                                       | 7 days, and 30 days for its whole family               | 30 minutes                        |
| How many times it works  | Any number, until it expires or its sign-in ends | Once                                                   | Once                              |
| What the server keeps    | Nothing. Its `sid` is on its family's rows       | A SHA-256 hash, in `refresh_tokens`                    | A SHA-256 hash, in `email_tokens` |
| Its row after it is used | There is no row                                  | Kept until the family's 30-day end                     | Deleted at once                   |
| Does a sign-out stop it? | **Yes, on the next request**                     | Yes, at once                                           | No. A sign-out does not touch it  |
| Does it sign anyone in?  | It is the proof of sign-in                       | It renews a sign-in                                    | No. It only changes the password  |

There are no cookies. The API reads the header and the body, and nothing
else.

## Three tables, side by side

The access token has no table of its own: the server stores nothing for it.
Its `sid` points at its family's rows in `refresh_tokens`. The package keeps
three tables. Only two of them ever get rows.

|                       | `refresh_tokens`                      | `email_tokens`                                  | `sessions`                               |
| --------------------- | ------------------------------------- | ----------------------------------------------- | ---------------------------------------- |
| What one row is       | One refresh token that was handed out | One reset link that can still be used           | One browser signed in with a cookie      |
| Rows in this app      | One for each sign-in and each refresh | Normally none, or one for each link that is out | **None, ever.** This API uses no cookies |
| Its key               | `id`, the hash of the token           | `id`, the hash of the token                     | `id`, the hash of the cookie             |
| How rows group        | By `family_id` and `sid`: one sign-in | By `user_id` and `purpose`                      | By `user_id`                             |
| How it is "used up"   | `used_at` is set. The row stays       | The row is deleted                              | Not used here                            |
| How it is ended early | `revoked` is set on the whole family  | A new email or password on the account          | Not used here                            |
| When a row is deleted | After the family's 30-day end         | When used, or soon after it expires             | Not used here                            |
| Link to `user`        | `user_id`, text, no foreign key       | `user_id`, text, no foreign key                 | `user_id`, text, no foreign key          |

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
  credentials.service.ts         checks a password at sign-in, and rechecks it
                                 once the sign-in has started
  jwt-auth.provider.ts           JwtAuth: loads the member and checks the
                                 sign-in, on every request
  password-reset.mailer.ts       finds the account, sends the email, stores the
                                 hash and ends the sign-ins in one transaction
  auth.dto.ts                    every /auth request body
  auth-throttler.guard.ts        rate limits
  config/auth.config.ts          the lifetimes and the secret
src/typeorm/
  authentication.entities.ts     the three tables
  typeorm-authentication.store.ts  every query the package asks for on them.
                                 It decides nothing
  sign-ins.repository.ts         the app's own two: isLive (is a sign-in still
                                 going?) and endAllForUser (end them all,
                                 inside the caller's transaction)
  sign-ins.module.ts             shares SignInsRepository with AuthModule and
                                 UsersModule
src/users/
  users.repository.ts            findById, findCredentials, updatePasswordHash,
                                 replacePasswordHash, signInStillValid
  users.service.ts               ends sign-ins on a password change, a close
                                 and a restore
  password-hashes.ts             checks a bcrypt or a scrypt hash
  user.policy.ts                 who may manage other members
src/hashtags/hashtag.policy.ts   who may delete and restore hashtags
```

The rules themselves are in the packages: `TokenService`, `SignInService`,
`PasswordResetService`, `PasswordHasher`, and both guards. The app calls
them, and never edits them.

Each route, its request body, and the method it ends up in:

| Route                            | Body               | Controller method                      | Then                                                                               |
| -------------------------------- | ------------------ | -------------------------------------- | ---------------------------------------------------------------------------------- |
| `POST /auth/sign-up`             | `CreateUserDto`    | `AuthController.signUp`                | `UsersService.createUser`                                                          |
| `POST /auth/token`               | `SignInDto`        | `TokensController.issue`               | `CredentialsService.verify`, `TokenService.issue`, `CredentialsService.stillValid` |
| `POST /auth/token/refresh`       | `RefreshTokenDto`  | `TokensController.refresh`             | `TokenService.refresh`                                                             |
| `POST /auth/token/revoke`        | `RefreshTokenDto`  | `TokensController.revoke`              | `TokenService.revoke`                                                              |
| `POST /auth/sign-out-everywhere` | none               | `SessionsController.signOutEverywhere` | `SignInService.signOutEverywhere`                                                  |
| `POST /auth/password/forgot`     | `EmailDto`         | `PasswordResetController.forgot`       | `PasswordResetService.request`                                                     |
| `POST /auth/password/reset`      | `ResetPasswordDto` | `PasswordResetController.reset`        | `PasswordResetService.reset`                                                       |

## The six flows

### 1. Sign in: `POST /auth/token`

1. `AuthThrottlerGuard` counts the try twice
   ([auth-throttler.guard.ts](../src/auth/auth-throttler.guard.ts)). Five in
   15 minutes are allowed for one identifier from one IP address, and 100 a
   minute from one IP address whatever identifier it sends.
2. `TokensController.issue` takes `{ identifier, password }`
   ([tokens.controller.ts](../src/auth/tokens.controller.ts)).
3. `CredentialsService.verify` finds the member with
   `UsersRepository.findCredentials` and checks the password with
   `verifyPassword`
   ([credentials.service.ts](../src/auth/credentials.service.ts)). If the
   stored hash is the old bcrypt kind, it stores a scrypt hash of the same
   password.
4. A wrong identifier or password is 401 `BAD_CREDENTIALS`.
5. `TokensController.issue` makes a new UUID for the sign-in, and passes
   `claims: { amr: ["pwd"], sid }` to `TokenService.issue` (in the package).
   That starts a **family**: a new `family_id`, and an end 30 days away. It
   makes a random refresh token, and
   [TypeOrmAuthenticationStore.saveRefreshToken](../src/typeorm/typeorm-authentication.store.ts)
   saves a **row** holding its hash, the family id and the claims. The store
   also copies `sid` into the row's `sid` column. Then the package signs the
   JWT, with the member's id as `sub`, and `amr` and `sid`.
6. **The recheck.** `CredentialsService.stillValid` calls
   `UsersRepository.signInStillValid`
   ([users.repository.ts](../src/users/users.repository.ts)). It reads the
   member's row `FOR SHARE`, and is true only when the account is still open
   and `passwordChangedAt` is the same as at step 3. If not, the new family
   is revoked and the answer is 401 `BAD_CREDENTIALS`. This catches a
   password change that landed while the password was being checked.
7. The answer is `{ accessToken, refreshToken, expiresIn }`.

### 2. An ordinary request

Three global guards run first, in this order:

1. **`AuthThrottlerGuard`**: 100 requests a minute from one IP address.
   Where the body names an account, it counts that account and IP address
   together instead, and also keeps a count of the IP address alone. Over
   either is 429.
2. **The authentication guard** (from `AuthenticationModule`, in
   `app.module.ts`): who is calling?
   - No `Authorization: Bearer` header on a route that is not `@Public()`:
     401 `missing_credentials`.
   - The package checks the JWT's signature, algorithm, expiry, issuer and
     audience. No database.
   - `JwtAuth.validate`
     ([jwt-auth.provider.ts](../src/auth/jwt-auth.provider.ts)) runs two
     queries side by side. `UsersRepository.findById` reads the member by
     `sub`. `SignInsRepository.isLive`
     ([sign-ins.repository.ts](../src/typeorm/sign-ins.repository.ts))
     checks that the sign-in named by `sid` is still going: it has a row of
     this member's, none of its rows is revoked, and its 30-day end is ahead.
   - It refuses a closed account, a token signed before the member's last
     password change, and a token whose sign-in ended. It refuses a token
     with no `sid` too, unless its `amr` is exactly `["dev"]`, which is what
     `pnpm dev:token` signs, and never in production. The 401 says
     `"unknown subject"`.
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
3. If it is unspent: is it inside its own 7 days, and its family's 30?
   (`"expired"`. A spent token goes on to step 4, expired or not.)
4. Is the row unused? **If it was used before, revoke the whole family**
   (`"reused"`).
5. Save the new token, then mark the old one used
   (`markRefreshTokenUsed`).

The client gets a new pair and throws the old refresh token away. No new
family is made: a refresh renews a sign-in, it never starts one.

### 4. Sign out

- **This device:** `POST /auth/token/revoke` → `TokensController.revoke` →
  `TokenService.revoke` → `TypeOrmAuthenticationStore.revokeRefreshTokenFamily`.
  It sets `revoked` on every row of that one family. It answers 204 for any
  token, real or made up. Only a body the DTO refuses gets a 400.
- **Every device:** `POST /auth/sign-out-everywhere` →
  `SessionsController.signOutEverywhere` →
  `SignInService.signOutEverywhere` → `TokenService.revokeAll` →
  `TypeOrmAuthenticationStore.revokeUserRefreshTokens`. The same, for every
  family the member has now. Needs the access token.

The refresh tokens stop at once. **The access tokens stop on their next
request.** Each one carries its family's `sid`, and on every request
`JwtAuth.validate` asks `SignInsRepository.isLive` about it. A revoked
family is not live, so the token gets 401. This check is the app's own, not
the docs'.

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
   address, and 100 a minute from one IP address whatever email it sends.
2. `PasswordResetController.forgot` calls `PasswordResetService.request` and
   does not wait for it
   ([password-reset.controller.ts](../src/auth/password-reset.controller.ts)).
   The answer is 202 for any well-formed email, so it does not reveal whether
   the email has an account.
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
   `PasswordResetMailer.updatePassword`, in one transaction, stores the hash,
   stamps `passwordChangedAt` and ends every sign-in with
   `SignInsRepository.endAllForUser`. Then the package deletes the member's
   other links, and ends the families once more, which finds nothing left.
6. The answer is 204 with no body. No tokens come back. The member now signs
   in with the new password, which is flow 1.

A wrong, used or expired link gets 400 `RESET_TOKEN_INVALID`, one answer for
all three.

**Where the two worlds touch:** only at step 5. A reset ends the member's
families, so every refresh token they held stops, and every access token
with it, through `sid`. `passwordChangedAt` stops the access tokens a second
way.

## What ends what

| What happened                                | Refresh tokens     | Access tokens                                 |
| -------------------------------------------- | ------------------ | --------------------------------------------- |
| Sign out on one device                       | That family stops  | That family's tokens stop on the next request |
| Sign out everywhere                          | Every family stops | Stop on the next request                      |
| A refresh token used twice                   | That family stops  | That family's tokens stop on the next request |
| A password change, by the member or an admin | Every family stops | Stop on the next request                      |
| A password reset                             | Every family stops | Stop on the next request                      |
| The account closed                           | Every family stops | Stop on the next request                      |
| The account restored by an admin             | Every family stops | Stay stopped                                  |
| 30 days since the sign-in                    | That family stops  | Stop at the same moment                       |

The access-token column follows one rule. `JwtAuth.validate` reads two
things on every request, side by side:

|                 | The member's row, in `user`                     | The sign-in's rows, in `refresh_tokens` |
| --------------- | ----------------------------------------------- | --------------------------------------- |
| Found by        | `sub`                                           | `sid`                                   |
| Read by         | `UsersRepository.findById`                      | `SignInsRepository.isLive`              |
| Stops the token | `deletedAt` set, or a newer `passwordChangedAt` | `revoked` set, or the 30-day end passed |
| In the docs?    | Yes                                             | No, the app's own                       |

Every line of the table above ends a family, so the second read stops the
access token. A password change, a reset and a closed account change the
member's row as well.

**A password change and the end of its families are one transaction.**
`UsersService.updateUser` writes the new hash and `passwordChangedAt`, then
calls `SignInsRepository.endAllForUser`, with the same `EntityManager`. Both
are saved or neither is. A reset (`PasswordResetMailer.updatePassword`), a
close (`UsersService.deleteUser`) and a restore (`UsersService.restoreUser`)
do the same. The package's own `revokeAll` methods cannot join a
transaction, which is why the app has its own.

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
thief's access token stops on its next request too, because its family is
revoked.

**9. A JWT cannot be cancelled. Does signing out stop it?**
Yes, on the next request. The JWT itself cannot be changed, but the server
can refuse it. Every access token carries its sign-in's id, `sid`.
`JwtAuth.validate` asks `SignInsRepository.isLive` about that `sid` on every
request, and a signed-out family is not live. The package alone does not do
this, and the NestJS docs accept an access token that works until it
expires. The app adds the `sid` column and the check. The cost is one
indexed read on each signed-in request.

**10. Then how does a password change stop it?**
Two ways. The change ends every family, so the `sid` check refuses the
token. And `JwtAuth.validate` compares the token's `iat` with the member's
`passwordChangedAt`: a token signed in an earlier second is refused. A
closed account is not found at all.

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
app's own key and options. It carries `amr: ["dev"]` and no `sid`, and
`JwtAuth` lets a token without a `sid` through only with that mark, and
never in production. It has no refresh token and no family, so a sign-out
cannot end it. A password change or a closed account still does.

**18. What is the sign-in recheck?**
A second look, once the new sign-in has started, at whether the password
changed while it was being checked. `CredentialsService.stillValid` asks
`UsersRepository.signInStillValid`, which compares `passwordChangedAt` with
the value read at the start. If it moved, or the account closed, the new
family is revoked and the answer is 401 `BAD_CREDENTIALS`. It compares the
time stamp, not the hash, because the bcrypt-to-scrypt upgrade changes the
hash without changing the password. The long version has a table of why
every timing is covered.
