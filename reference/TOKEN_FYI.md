# Token FYI

The short version of how tokens work in this code. Each step names the file
and the method, so you can open it and read along.
[TOKENS_AND_SESSIONS.md](./TOKENS_AND_SESSIONS.md) is the long version, with
the reasons.

## The picture in one minute

- **A login makes a session.** One login on one device is one session, and
  it has one row in the `session` table.
- **A session has refresh tokens.** Its first one, and one more each time it
  is renewed. Each has a row in `refresh_token` that points at the session.
- **The access token names its session.** It is a JWT, and it carries the
  session's id.

```text
user ──< session ──< refresh_token
            ▲
            └── the access token carries this row's id, as `sid`
```

Read `──<` as "has many". A user has many sessions, and a session has many
refresh tokens.

Everything about whether a member is still logged in is on the session row.

## Three tokens, two jobs

This app has three tokens. Two of them work together to keep a member logged
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
up in different ways.

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
| Does it log anyone in?   | It is the proof of login        | It renews a login                          | No. It only changes the password          |

There are no cookies. The API reads the header and the body, and nothing
else.

## Three tables, side by side

The access token has no table: the server stores nothing for it. Sessions
have two tables that belong together, and the password reset link has one
that stands apart.

|                                 | `session`                               | `refresh_token`                       | `password_reset_token`                |
| ------------------------------- | --------------------------------------- | ------------------------------------- | ------------------------------------- |
| What one row is                 | One login                               | One refresh token that was handed out | One reset link that can still be used |
| Its key                         | `id`, a random UUID                     | `id`, the hash of the token           | `tokenHash`, the hash of the token    |
| What it points at               | The user                                | Its session                           | The user                              |
| What else it holds              | When it ends, and when it was ended     | When it expires, and when it was used | When it expires                       |
| Rows for one member             | One for each login                      | One for each refresh of each session  | Normally one                          |
| How it is "used up"             | `revokedAt` is set. The row stays       | `usedAt` is set. The row stays        | The row is deleted                    |
| When a row is deleted           | 180 days after the session ends         | With its session                      | When it is used, replaced or expired  |
| Is the row kept as a record?    | Yes                                     | Yes                                   | No                                    |
| If the user row is hard-deleted | Postgres refuses (`ON DELETE RESTRICT`) | Not linked to the user directly       | The rows go with the user (`CASCADE`) |
| The code that owns it           | `SessionsService`, `SessionsRepository` | The same two                          | `PasswordResetService`                |

**How to tell them apart in one line:** `session` says whether a login is
still good, `refresh_token` says which keys to it were handed out, and
`password_reset_token` forgets a link the moment it is used.

Flows 1 to 5 below are about the access token, the refresh token and the two
session tables. Flow 6 is the password reset token and its table.

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

## The two session tables

**`session`**: one row for each login
([session.entity.ts](../src/auth/sessions/session.entity.ts)).

| Column      | In plain words                                               |
| ----------- | ------------------------------------------------------------ |
| `id`        | A random UUID. The access token carries it as `sid`          |
| `userId`    | Whose session it is                                          |
| `expiresAt` | When it ends by itself: 30 days after the login. Never moves |
| `revokedAt` | When it was ended on purpose. Empty if nobody ended it       |

**`refresh_token`**: one row for each refresh token
([refresh-token.entity.ts](../src/auth/sessions/refresh-token.entity.ts)).

| Column      | In plain words                                |
| ----------- | --------------------------------------------- |
| `id`        | The hash of the token                         |
| `sessionId` | Which session it belongs to                   |
| `expiresAt` | When this one token stops working (7 days)    |
| `usedAt`    | When it was swapped. Empty means not used yet |

**A session is live when its one row says so.** Both of these must hold:

- `revokedAt` is empty, so nobody ended it, and
- `expiresAt` is in the future, so it has not run out.

Other writing, the NestJS docs included, has no session table. It calls the
refresh tokens of one login a "token family" and marks each of them revoked.
It is the same idea with the session's facts copied onto every token.

## Where the code is

```text
src/auth/
  auth.controller.ts      every /auth route
  auth.service.ts         signup, and the three steps of login
  one-time-token.ts       makes and hashes a random token. Both folders use it
  sessions/               logging in, staying logged in, logging out
    sessions.module.ts        exports SessionsService, and nothing else
    sessions.service.ts       the rules: start, refresh, end, endAll, isLive
    sessions.repository.ts    the queries on both tables. It decides nothing
    session.entity.ts         the session table
    refresh-token.entity.ts   the refresh_token table
    dto/                      login, refresh and logout request bodies
  password-reset/         the emailed reset link
    password-reset.service.ts        its rules and its queries
    password-reset-token.entity.ts   the password_reset_token table
    dto/                             forgot-password and reset-password bodies
src/shared/guards/
  jwt-auth.guard.ts       checks the access token on every request
```

**One door in.** Everything outside `sessions/` talks to `SessionsService`
and to nothing else in that folder: the controller, `AuthService`,
`UsersService` and the guard.

Each route, its request body, and the method it ends up in:

| Route                        | Body                | Controller method               | Then                                         |
| ---------------------------- | ------------------- | ------------------------------- | -------------------------------------------- |
| `POST /auth/login`           | `LoginDto`          | `AuthController.login`          | `AuthService.login`, `SessionsService.start` |
| `POST /auth/refresh`         | `RefreshDto`        | `AuthController.refresh`        | `SessionsService.refresh`                    |
| `POST /auth/logout`          | `LogoutDto`         | `AuthController.logout`         | `SessionsService.end`                        |
| `POST /auth/logout-all`      | none                | `AuthController.logoutAll`      | `SessionsService.endAll`                     |
| `POST /auth/forgot-password` | `ForgotPasswordDto` | `AuthController.forgotPassword` | `PasswordResetService.requestEmail`          |
| `POST /auth/reset-password`  | `ResetPasswordDto`  | `AuthController.resetPassword`  | `PasswordResetService.reset`                 |

## The six flows

### 1. Log in: `POST /auth/login`

1. `AuthController.login` takes `{ identifier, password }`
   ([auth.controller.ts](../src/auth/auth.controller.ts)).
2. `AuthService.login` checks the password with
   `UsersService.getUserByCredentials`
   ([auth.service.ts](../src/auth/auth.service.ts)).
3. `SessionsService.start` saves a **session row**: a new id, the member, and
   an end 30 days away
   ([sessions.service.ts](../src/auth/sessions/sessions.service.ts)).
4. `SessionsService.pair` makes a random refresh token and saves a **token
   row** holding its hash and the session's id. Then `signToken` signs the
   JWT, with the session's id in it as `sid`.
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
   - `SessionsService.isLive`: is the session named by `sid` still going?
     That reads one session row by its id.
4. If both say yes, it writes `request.user = { userId, username, role }`.
5. `RolesGuard` checks the role that `@Auth()` asked for.
6. `@CurrentUser()` hands `request.user` to the controller method.

### 3. Refresh: `POST /auth/refresh`

All of it is `SessionsService.refresh`. One query,
`SessionsRepository.findToken`, fetches the token's row, its session's row
and the member. Then it refuses with 401 at the first check that fails:

1. Is it shaped like one of our tokens? (Checked before the query.)
2. Is there a row for its hash, in a session that is not over?
3. Is the row unused? **If it was used before, end the session.**
4. Is it inside its own 7 days?
5. Does the member still have an account?
6. Save the new token (`pair`), then mark the old one used
   (`markTokenUsed`).

The client gets a new pair and throws the old refresh token away. No new
session row is made: a refresh renews a session, it never starts one.

### 4. Log out

- **This device:** `POST /auth/logout` → `SessionsService.end` →
  `SessionsRepository.revokeSession`. It sets `revokedAt` on that one session
  row.
- **Every device:** `POST /auth/logout-all` → `SessionsService.endAll` →
  `SessionsRepository.revokeSessionsOfUser`. The same, for every session the
  member has now.

The guard's `isLive` then answers no, so the access token stops on its next
request. The refresh tokens stop too, because refresh checks the same row.

### 5. Cleanup

There is no scheduled job. Each time a token is saved, `SessionsService.pair`
calls `SessionsRepository.deleteSessionsEndedBy`: one `DELETE` of every
session that ended 180 days ago or more. Postgres deletes each session's
tokens with it. So the tables are cleaned whenever someone logs in or
refreshes.

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
   ([password-reset.service.ts](../src/auth/password-reset/password-reset.service.ts)).
   The answer is 202 every time, so it does not reveal whether the email has
   an account.
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
   password and, in the same transaction, calls `SessionsService.endAll`.
4. The answer is 204 with no body. No tokens come back. The member now logs
   in with the new password, which is flow 1.

A wrong, used or expired token gets 400 `RESET_TOKEN_INVALID`, one answer for
all three.

**Where the two worlds touch:** only at step 3. A password reset ends the
member's sessions, so every refresh token they held stops working.

## What ends a session

| What happened                            | What changes on the session row |
| ---------------------------------------- | ------------------------------- |
| Logging out, on one device or all        | `revokedAt` is set              |
| A refresh token used twice               | `revokedAt` is set              |
| A password change or a password reset    | `revokedAt` is set, on all      |
| The account closed, or restored by admin | `revokedAt` is set, on all      |
| 30 days passing since the login          | Nothing. `expiresAt` has passed |

## Tombstones and the 180 days

- A **tombstone** is a row kept after it stopped being useful: a session
  that is over, or a refresh token that is spent or expired. It stays as a
  record.
- A session row is deleted **180 days after the session ends**, and its
  token rows go with it. The setting is `SESSION_RETENTION`, in seconds.
- A session row says **when** it was ended, in `revokedAt`. That time is
  written once and never changed.
- A session that is over is never changed again. Logging out and "log out
  everywhere" only touch sessions that are still going.
- A user row cannot be hard-deleted while it has session rows. The foreign
  key is `ON DELETE RESTRICT`, so Postgres refuses. The app only ever soft
  deletes a user, so this never gets in its way.
- Why 180 days: SOC 2 and ISO/IEC 27001 do not name a number. They ask for a
  written period that is kept to. This is ours.
- **A password reset token leaves no tombstone.** Its row is deleted the
  moment it is used, replaced or expired.

## Questions, with short answers

**1. What is a session?**
One login on one device. It is a row in the `session` table, made when the
password is checked, and it is over when it is ended on purpose or 30 days
have passed.

**2. Why two tokens and not one?**
The token sent with every request is the one most likely to leak, so it is
short-lived. The long-lived one is sent rarely, so the member is not asked
for a password every 15 minutes.

**3. Why is the refresh token not a JWT?**
The server has to look it up anyway, to see whether it was used. A signature
would add nothing. Random text also cannot be mistaken for an access token.

**4. Why store a hash of it?**
So someone who reads the table, or a backup of it, finds nothing they can
use.

**5. Why SHA-256 and not bcrypt?**
bcrypt is slow to make short passwords costly to guess. A token is 32 random
bytes, so there is nothing to guess, and a fast hash can be found by an
index.

**6. Why does a refresh token work only once?**
So a stolen one is noticed. If a spent token comes back, two parties hold
it.

**7. What happens when one is used twice?**
The session ends. The server cannot tell the thief from the member, so both
are logged out, and only the member knows the password.

**8. A JWT cannot be cancelled. How does logging out work at once?**
The JWT carries the session's id (`sid`), and the guard reads that session's
row on every request. Logging out sets `revokedAt` on the row, so the next
request is refused. The cost is two small queries per request.

**9. Why is there no role in the JWT?**
A token cannot change after it is signed. A role in it would be wrong the
moment an admin is demoted. The guard reads the role from the database.

**10. What if two requests send the same refresh token at the same moment?**
One `UPDATE ... WHERE "usedAt" IS NULL` decides. Postgres lets one of them
change the row. The other changes nothing, counts as a second use, and the
session ends.

**11. Why a session table, when the token rows could carry it all?**
Because a session is a real thing with its own facts: whose it is, when it
ends, when it was ended. With its own row, logging out changes one row, the
guard reads one row, and the code can say "session" and mean one thing.

**12. Why keep dead sessions and tokens for 180 days?**
For the record: which sessions a member had, when each ended, and when each
token was used. A side benefit is that a replayed token is caught for the
whole life of its session.

**13. How is the password reset token different from the refresh token?**
They are the same kind of string, hashed the same way. Everything else
differs. The refresh token keeps a logged-in member logged in, lasts 7 days,
and leaves a row behind as a record. The reset token is for someone who
cannot log in, arrives by email, lasts 30 minutes, and its row is deleted
the moment it is used.

**14. Does resetting a password log the member in?**
No. The reset answers 204 with no tokens, and ends every session the member
had. They log in again with the new password.
