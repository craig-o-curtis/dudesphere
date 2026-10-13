# Token FYI

The short version of how tokens work in this code. Each step names the file
and the method, so you can open it and read along.
[TOKENS_AND_SESSIONS.md](./TOKENS_AND_SESSIONS.md) is the long version, with
the reasons.

## Three tokens, two jobs

This app has three tokens. Two of them work together to keep a member signed
in. The third has a different job: it lets a member who **cannot** log in
choose a new password.

| Token                | Its job                                               |
| -------------------- | ----------------------------------------------------- |
| Access token         | Proves who is calling, on every request               |
| Refresh token        | Gets a new access token when the old one runs out     |
| Password reset token | Lets a member who forgot their password set a new one |

The refresh token and the password reset token look the same: both are 43
random characters, made by the same function. That is where the likeness
ends. They live in different tables, last for different times, and are used
up in different ways. The next table sets all three side by side.

## The three tokens, side by side

|                          | Access token                    | Refresh token                              | Password reset token                      |
| ------------------------ | ------------------------------- | ------------------------------------------ | ----------------------------------------- |
| What it is               | A JWT, signed with `JWT_SECRET` | 43 random characters. Not a JWT            | 43 random characters. Not a JWT           |
| What is in it            | User id, username, session id   | Nothing. It is a key to a row              | Nothing. It is a key to a row             |
| How the member gets it   | In the answer to a login        | In the same answer                         | By email, inside a link                   |
| Where it is sent back    | `Authorization: Bearer` header  | Body of `/auth/refresh` and `/auth/logout` | Body of `/auth/reset-password`            |
| How long it lasts        | 15 minutes                      | 7 days                                     | 30 minutes                                |
| How many times it works  | Any number, until it expires    | Once                                       | Once                                      |
| What the server keeps    | Nothing                         | A SHA-256 hash, in `refresh_token`         | A SHA-256 hash, in `password_reset_token` |
| Its row after it is used | There is no row                 | Kept for the record, then deleted          | Deleted at once                           |
| Does it sign anyone in?  | It is the proof of login        | It renews a login                          | No. It only changes the password          |

There are no cookies. The API reads the header and the body, and nothing
else.

## Two tables, side by side

The access token has no table: the server stores nothing for it. The other
two tokens each have a table of their own, and the two tables never refer to
each other.

|                                 | `refresh_token`                                                 | `password_reset_token`                               |
| ------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------- |
| What one row is                 | One refresh token that was handed out                           | One reset link that can still be used                |
| Why the table exists            | To keep a member logged in, and to log them out                 | To let a member with no password prove who they are  |
| Where the token's hash is       | `id`, the primary key                                           | `tokenHash`, a unique column. `id` is a plain number |
| What else it holds              | The session (`sessionId`), two end times, `usedAt`, `revoked`   | Whose it is, and one end time                        |
| Rows for one member             | Many. One for every refresh of every session                    | Normally one. Asking again deletes the earlier one   |
| How a token is used up          | `usedAt` is set. The row stays                                  | The row is deleted                                   |
| When a row is deleted           | 180 days after its session ends                                 | When it is used, replaced or expired                 |
| Is the row kept as a record?    | Yes. That is a tombstone                                        | No                                                   |
| If the user row is hard-deleted | Postgres refuses (`ON DELETE RESTRICT`)                         | The rows go with the user (`ON DELETE CASCADE`)      |
| Whose clock decides "expired"   | The app's                                                       | The database's (`CURRENT_TIMESTAMP`)                 |
| The code that owns it           | `RefreshTokensService` for queries, `SessionsService` for rules | `PasswordResetService`                               |

The entities are [refresh-token.entity.ts](../src/auth/sessions/refresh-token.entity.ts)
and [password-reset-token.entity.ts](../src/auth/password-reset/password-reset-token.entity.ts).

**How to tell them apart in one line:** `refresh_token` remembers, and
`password_reset_token` forgets. A refresh token row is history worth keeping.
A reset link that has been used is worth nothing, so it is gone.

Flows 1 to 5 below are about the access token, the refresh token and the
`refresh_token` table. Flow 6 is the password reset token and its table.

## Logging in: the idea in five sentences

1. Logging in gives the client two tokens: an **access token** and a
   **refresh token**.
2. The access token goes with every request and dies after 15 minutes.
3. The refresh token is swapped for a new pair when the access token dies,
   and each refresh token works once.
4. One login is one **session**, and the server can end a session at any
   moment.
5. Every logged-in request asks the database "is this session still going?",
   so ending a session takes effect on the very next request.

## The session table: `refresh_token`

Everything about sessions is in `refresh_token`
([refresh-token.entity.ts](../src/auth/sessions/refresh-token.entity.ts)). One row for
each refresh token ever handed out.

| Column             | In plain words                                    |
| ------------------ | ------------------------------------------------- |
| `id`               | The hash of the token                             |
| `sessionId`        | Which session the token belongs to                |
| `userId`           | Whose it is                                       |
| `expiresAt`        | When this one token stops working (7 days)        |
| `sessionExpiresAt` | When the whole session stops (30 days from login) |
| `usedAt`           | When it was swapped. Empty means not used yet     |
| `revoked`          | True when the session was ended on purpose        |

**A session is not a row. It is all the rows that share one `sessionId`.**
The access token carries that `sessionId` as its `sid` claim. Other writing,
the NestJS docs included, calls this group of rows a "token family".

A session is live when both of these hold:

- at least one of its rows has `sessionExpiresAt` in the future, and
- none of its rows has `revoked = true`.

## Where the code is

```text
src/auth/
  auth.controller.ts      every /auth route
  auth.service.ts         signup, and the three steps of login
  one-time-token.ts       makes and hashes a random token. Both folders use it
  sessions/               the access token and the refresh token
    sessions.service.ts         the rules: start, refresh, end, endAll
    refresh-tokens.service.ts   the queries on refresh_token. It decides nothing
    refresh-token.entity.ts     the refresh_token table
    refresh-tokens.module.ts    lets other modules use the queries
  password-reset/         the emailed reset link
    password-reset.service.ts        its rules and its queries
    password-reset-token.entity.ts   the password_reset_token table
src/shared/guards/
  jwt-auth.guard.ts       checks the access token on every request
```

Each route, and the method it ends up in:

| Route                        | Controller method               | Then                                         |
| ---------------------------- | ------------------------------- | -------------------------------------------- |
| `POST /auth/login`           | `AuthController.login`          | `AuthService.login`, `SessionsService.start` |
| `POST /auth/refresh`         | `AuthController.refresh`        | `SessionsService.refresh`                    |
| `POST /auth/logout`          | `AuthController.logout`         | `SessionsService.end`                        |
| `POST /auth/logout-all`      | `AuthController.logoutAll`      | `SessionsService.endAll`                     |
| `POST /auth/forgot-password` | `AuthController.forgotPassword` | `PasswordResetService.requestEmail`          |
| `POST /auth/reset-password`  | `AuthController.resetPassword`  | `PasswordResetService.reset`                 |

## The six flows

### 1. Log in: `POST /auth/login`

1. `AuthController.login` takes `{ identifier, password }`
   ([auth.controller.ts](../src/auth/auth.controller.ts)).
2. `AuthService.login` checks the password with
   `UsersService.getUserByCredentials`
   ([auth.service.ts](../src/auth/auth.service.ts)).
3. `SessionsService.start` makes a new `sessionId` and sets the session's end, 30
   days away ([sessions.service.ts](../src/auth/sessions/sessions.service.ts)).
4. `SessionsService.pair` makes a random refresh token, saves its hash with
   `RefreshTokensService.save`, and signs the JWT with `signToken`.
5. `AuthService.login` checks the password once more
   (`credentialsStillHold`), in case it changed in the last tenth of a
   second.
6. The answer is `{ accessToken, refreshToken, expiresIn }`.

### 2. An ordinary request

1. `JwtAuthGuard.canActivate` runs first, on every route
   ([jwt-auth.guard.ts](../src/shared/guards/jwt-auth.guard.ts)). It is a
   global guard, registered with `APP_GUARD` in `app.module.ts`.
2. `verifyToken` checks the JWT's signature and expiry. No database.
3. It then asks two questions side by side:
   - `UsersService.getUserForToken`: does this member still exist?
   - `RefreshTokensService.isSessionLive`: is this session still going?
4. If both say yes, it writes `request.user = { userId, username, role }`.
5. `RolesGuard` checks the role that `@Auth()` asked for.
6. `@CurrentUser()` hands `request.user` to the controller method.

### 3. Refresh: `POST /auth/refresh`

All of it is `SessionsService.refresh`. It refuses with 401 at the first check
that fails:

1. Is it shaped like one of our tokens?
2. Is there a row for its hash, in a session that is not over?
3. Is the row unused? **If it was used before, end the whole session.**
4. Is it inside its own 7 days?
5. Does the member still have an account?
6. Save the new token (`pair`), then mark the old one used (`markUsed`).

The client gets a new pair and throws the old refresh token away.

### 4. Log out

- **This device:** `POST /auth/logout` → `SessionsService.end` →
  `RefreshTokensService.revokeSession`. It sets `revoked = true` on every row
  of that session.
- **Every device:** `POST /auth/logout-all` → `SessionsService.endAll`
  → `RefreshTokensService.revokeAllForUser`. The same, for every session the
  member has now.

The guard's `isSessionLive` then answers no, so the access token stops on its
next request.

### 5. Cleanup

There is no scheduled job. `RefreshTokensService.save` runs one `DELETE`
after each insert: the rows of every session that ended 180 days ago or
more. So the table is cleaned whenever someone logs in or refreshes.

### 6. Forgot password: the third token

This flow has its own token, its own table and its own service. It makes no
session and hands out no access token.

The table is `password_reset_token`
([password-reset-token.entity.ts](../src/auth/password-reset/password-reset-token.entity.ts)):

| Column      | In plain words                           |
| ----------- | ---------------------------------------- |
| `userId`    | Whose link it is                         |
| `tokenHash` | The hash of the token in the link        |
| `expiresAt` | When the link stops working (30 minutes) |

**Asking for the link:** `POST /auth/forgot-password` with `{ email }`.

1. `AuthController.forgotPassword` starts
   `PasswordResetService.requestEmail` and does not wait for it
   ([password-reset.service.ts](../src/auth/password-reset/password-reset.service.ts)). The
   answer is 202 every time, so it does not reveal whether the email has an
   account.
2. `sendLink` looks the member up by email. If there is none, it stops.
3. It deletes that member's earlier links, and any link that has expired. So
   only the newest link works.
4. It makes a token with `newOneTimeToken()`, the same function the refresh
   token uses ([one-time-token.ts](../src/auth/one-time-token.ts)), and saves
   its hash with an `expiresAt` 30 minutes away.
5. It emails `<FRONTEND_URL>/reset-password?token=<token>`.

**Using the link:** `POST /auth/reset-password` with
`{ token, password, confirmPassword }`.

1. `AuthController.resetPassword` calls `PasswordResetService.reset`.
2. `consume` runs one statement: `DELETE` the row with that hash, if it has
   not expired, and return its `userId`. **Deleting the row is how the token
   is used.** It cannot work twice, because the row is gone.
3. `setPassword` calls `UsersService.updateUser`. That hashes the new
   password and, in the same transaction, ends every session the member has.
4. The answer is 204 with no body. No tokens come back. The member now signs
   in with the new password, which is flow 1.

A wrong, used or expired token gets 400 `RESET_TOKEN_INVALID`, one answer for
all three.

**Where the two worlds touch:** only at step 3. A password reset ends the
member's sessions, so every refresh token they held stops working.

## What ends a session

- Logging out, on one device or all of them.
- A refresh token used twice.
- A password change or a password reset. Every session of the member ends.
- The account being closed, or restored by an admin.
- 30 days passing since the login.

## Tombstones and the 180 days

- A **tombstone** is a row whose token no longer works: spent, expired,
  revoked, or in a session that is over. It stays in the table as a record.
- The rows of a session are deleted together, **180 days after the session
  ends**. The setting is `SESSION_RETENTION`, in seconds.
- A session that is over is never changed again. Logging out and "log out
  everywhere" only mark sessions that are still going.
- A user row cannot be hard-deleted while it has token rows. The foreign key
  is `ON DELETE RESTRICT`, so Postgres refuses. The app only ever soft
  deletes a user, so this never gets in its way.
- Why 180 days: SOC 2 and ISO/IEC 27001 do not name a number. They ask for a
  written period that is kept to. This is ours.
- **Tombstones are for refresh tokens only.** A password reset token leaves
  nothing behind: its row is deleted the moment it is used, replaced or
  expired.

## Twelve questions, with short answers

**1. Why two tokens and not one?**
The token sent with every request is the one most likely to leak, so it is
short-lived. The long-lived one is sent rarely, so the member is not asked
for a password every 15 minutes.

**2. Why is the refresh token not a JWT?**
The server has to look it up anyway, to see whether it was used. A signature
would add nothing. Random text also cannot be mistaken for an access token.

**3. Why store a hash of it?**
So someone who reads the table, or a backup of it, finds nothing they can
use.

**4. Why SHA-256 and not bcrypt?**
bcrypt is slow to make short passwords costly to guess. A token is 32 random
bytes, so there is nothing to guess, and a fast hash can be found by an
index.

**5. Why does a refresh token work only once?**
So a stolen one is noticed. If a spent token comes back, two parties hold
it.

**6. What happens when one is used twice?**
The whole session ends. The server cannot tell the thief from the member, so
both are logged out, and only the member knows the password.

**7. A JWT cannot be cancelled. How does logging out work at once?**
The JWT carries the session id (`sid`), and the guard checks that session in
the database on every request. The cost is two small queries per request.

**8. Why is there no role in the JWT?**
A token cannot change after it is signed. A role in it would be wrong the
moment an admin is demoted. The guard reads the role from the database.

**9. What if two requests send the same refresh token at the same moment?**
One `UPDATE ... WHERE "usedAt" IS NULL` decides. Postgres lets one of them
change the row. The other changes nothing, counts as a second use, and the
session ends.

**10. Why keep dead refresh tokens for 180 days?**
For the record: which sessions a member had and how each ended. A side
benefit is that a replayed token is caught for the whole life of its
session.

**11. How is the password reset token different from the refresh token?**
They are the same kind of string, hashed the same way. Everything else
differs. The refresh token keeps a logged-in member logged in, lasts 7 days,
and leaves a row behind as a record. The reset token is for someone who
cannot log in, arrives by email, lasts 30 minutes, and its row is deleted
the moment it is used.

**12. Does resetting a password sign the member in?**
No. The reset answers 204 with no tokens, and ends every session the member
had. They log in again with the new password.
