# Tokens and sessions

## TLDR description

A member who signs in gets two tokens. The **access token** proves who they
are on every request, and lasts 15 minutes. The **refresh token** does one
thing: it is swapped for a new pair when the access token runs out, and it
works once.

One sign-in is one **session**. The server can end a session at any moment,
and when it does, both tokens stop working on the very next request.

The flows below are run over real HTTP and the real database by
[test/tokens.e2e-spec.ts](../test/tokens.e2e-spec.ts), and the main ones were
also run by hand with curl. The password reset flow is in
[test/password-reset.e2e-spec.ts](../test/password-reset.e2e-spec.ts).

## The words

| Word          | What it means here                                                               |
| ------------- | -------------------------------------------------------------------------------- |
| Access token  | A signed JWT. Sent with every request as `Authorization: Bearer <accessToken>`   |
| Refresh token | 43 random characters. Sent to two routes only: to get a new pair, or to sign out |
| Pair          | One access token and one refresh token, handed out together                      |
| Session       | Everything that follows from one sign-in, until it ends                          |
| Family        | The refresh tokens of one session. "Family" and "session" are the same thing     |
| `sid`         | "Session id". The claim in the access token that names its session               |
| Successor     | The new refresh token a client gets when it swaps the old one                    |
| Rotation      | Replacing the refresh token on every use. Each one works once                    |
| Revoke        | End a session on purpose                                                         |
| Opaque        | Carrying no readable data. The refresh token is opaque; the access token is not  |

## The two tokens

|                          | Access token                             | Refresh token                             |
| ------------------------ | ---------------------------------------- | ----------------------------------------- |
| What it is               | A JWT: three parts with dots between     | 32 random bytes, written as 43 characters |
| What it carries          | The member's id, username and session id | Nothing. It is only a key to a row        |
| How long it lasts        | 15 minutes                               | 7 days, and each use starts a new 7 days  |
| How often it is sent     | With every request                       | Only when the access token has run out    |
| Where it is sent         | Every route that needs a signed-in user  | `POST /auth/token/refresh` and `revoke`   |
| How the server checks it | Verifies the signature, then two queries | Looks up its hash in `refresh_token`      |
| What the server stores   | Nothing                                  | A SHA-256 hash of it, never the token     |
| How many times it works  | As often as needed until it expires      | Once                                      |

**Why two?** They pull in opposite directions. The token that travels with
every request is the one most likely to leak, so it should die fast. But a
member should not have to type a password every 15 minutes. So the short
token does the travelling, and a long one stays home and only comes out to
fetch a new short one.

## What is inside the access token

A JWT is three base64 parts: a header, a payload and a signature. Anyone can
read the first two. Nobody can change them, because the signature is made
with `JWT_SECRET`, which only the server holds.

The payload of an access token from this app:

```json
{
  "sub": 25,
  "username": "walter",
  "sid": "0b9f6d1e-6f0c-4a3e-9d55-2f1f6f0f7a10",
  "iat": 1791700000,
  "exp": 1791700900,
  "aud": "dudesphere-api",
  "iss": "dudesphere"
}
```

| Claim      | Meaning                                                          | Who writes it                       |
| ---------- | ---------------------------------------------------------------- | ----------------------------------- |
| `sub`      | "Subject": the member's user id                                  | `jwtPayloadFor`                     |
| `username` | The member's username at sign-in. The server never reads it back | `jwtPayloadFor`                     |
| `sid`      | The session this token belongs to: the `familyId` of its rows    | `jwtPayloadFor`, for `TokenService` |
| `iat`      | "Issued at", in seconds since 1970                               | The JWT library                     |
| `exp`      | "Expires", in seconds since 1970. Here `iat` plus 900            | The JWT library                     |
| `aud`      | "Audience": who the token is for                                 | `JwtModule` options                 |
| `iss`      | "Issuer": who signed it                                          | `JwtModule` options                 |

**There is no role in it, on purpose.** A token cannot change once it is
signed. A role in it would be a copy that goes stale the moment an admin is
demoted. The server reads the role from the database on every request, and a
client that wants it asks `GET /users/me`.

## The `refresh_token` table

One row for each refresh token handed out. The entity is
[src/auth/refresh-token.entity.ts](../src/auth/refresh-token.entity.ts).

| Column            | Holds                                                                |
| ----------------- | -------------------------------------------------------------------- |
| `id`              | The SHA-256 hash of the token, as 64 hex characters. The primary key |
| `familyId`        | The session. Every token from one sign-in shares it                  |
| `userId`          | Whose token it is                                                    |
| `expiresAt`       | When this one token stops working                                    |
| `familyExpiresAt` | When the whole session ends, however often it was renewed            |
| `usedAt`          | When the token was swapped. Empty until then                         |
| `revoked`         | True once the session was ended on purpose                           |
| `createdAt`       | When the row was made                                                |

**The token itself is never stored.** The server hashes whatever a client
sends and looks for that hash. Someone who reads the table finds hashes, and
a hash cannot be turned back into a token.

Here is one session over three days. Walter signs in on Monday, and his
client refreshes on Tuesday and on Wednesday. All three rows share one
`familyId`:

| `id` (hash of) | `familyId` | `usedAt`  | `expiresAt`    | `familyExpiresAt` | `revoked` |
| -------------- | ---------- | --------- | -------------- | ----------------- | --------- |
| token A        | `0b9f…`    | Tuesday   | next Monday    | Monday + 30 days  | false     |
| token B        | `0b9f…`    | Wednesday | next Tuesday   | Monday + 30 days  | false     |
| token C        | `0b9f…`    |           | next Wednesday | Monday + 30 days  | false     |

Read it like this:

- Tokens A and B are spent. Only C can still be swapped.
- `expiresAt` moves forward with each new token. That is why a member who
  keeps coming back stays signed in.
- `familyExpiresAt` never moves. It is set at sign-in and copied to each
  successor. After 30 days the session ends, whatever the member did.

## Signing in, step by step

`POST /auth/token` with `{ "identifier": "walter", "password": "..." }`.

1. `TokensController.issue` receives the body and hands it to
   `AuthService.signIn`, which does the next three steps.
2. `UsersService.getUserByCredentials` checks the username or email and the
   password. A wrong one is 401 `BAD_CREDENTIALS`, with one message whichever
   was wrong.
3. `TokenService.issue` starts a session:
   - it makes a new `familyId`, a random UUID;
   - it sets the session's end, 30 days from now;
   - it makes a refresh token, 32 random bytes;
   - it saves one row, holding the token's hash;
   - it signs an access token whose `sid` is that `familyId`.
4. `UsersService.credentialsStillHold` asks once more: is the password that
   was checked in step 2 still the member's password? See "The sign-in
   recheck" below for why.
5. The answer is 200:

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOjI1fQ.c2lnbmF0dXJl",
  "refreshToken": "n8VbQ2k1ZxYp3mR7tLwA9cHd0eFgJiKoNsUvBq4y6Xs",
  "expiresIn": 900
}
```

`expiresIn` is the access token's lifetime in seconds, so a client knows when
to refresh without decoding anything.

Signing in twice, on a phone and a laptop, makes two sessions with two
`familyId`s. Ending one leaves the other alone.

## The sign-in recheck

Step 4 of signing in closes a gap of about a tenth of a second.

Checking a password is slow on purpose. bcrypt takes roughly 100 ms, so that
guessing passwords is costly. That leaves a moment in which this can happen:

1. Someone who knows Walter's **old** password starts a sign-in. The server
   reads Walter's stored hash and begins checking the password against it.
2. In that same tenth of a second, Walter changes his password. The change
   ends every session he has.
3. The sign-in from step 1 finishes its check, which passes against the hash
   it read, and starts a new session.

That new session was started after step 2 ended "every session", so nothing
ended it. The holder of the old password would stay signed in for 30 days.

So once the session exists, `AuthService.signIn` asks
`UsersService.credentialsStillHold`: is the hash that was checked still the
member's stored hash, on an account that is still open? If not, it ends the
session it just started and answers 401 `BAD_CREDENTIALS`, as for any wrong
password.

The read uses a row lock (`SELECT ... FOR SHARE`). A password change holds
its own lock on the user row from its `UPDATE` until it commits, so the
recheck waits for a change that is in flight and then sees the new hash.
Without the lock it could read the old hash a moment before the commit.

Nobody can force this timing, and it needs the old password to begin with.
It is closed because someone who already has a password, and expects it to
be changed, could sign in over and over to try to land in the gap.

## An ordinary request: what the guard checks

Every route goes through
[JwtAuthGuard](../src/shared/guards/jwt-auth.guard.ts). On a route that is not
`@Public()` a token is required, and the guard makes three checks:

1. **Is the token real?** The JWT library checks the signature, the expiry,
   the audience, the issuer and the algorithm. This needs no database.
2. **Does its member still exist?** `UsersService.getUserForToken` reads the
   member by the `sub` in the token. It finds nobody when the account is
   closed, or when the password changed after the token was signed.
3. **Is its session still going?** `RefreshTokensService.isSessionLive` reads
   the session by the `sid` in the token. A session is live when it has rows,
   none of them is revoked, and it has not passed `familyExpiresAt`.

Checks 2 and 3 are one small query each, and run side by side. Any of the
three failing is 401 `TOKEN_INVALID`.

**This is the part most JWT setups skip.** A plain JWT guard does check 1
only, so a signed token works until it expires, whatever has happened since.
Checks 2 and 3 are why signing out here means signed out, at once.

On a `@Public()` route the token is optional. If one is sent, the guard makes
the same three checks. A token that fails them is ignored, and the caller
goes through as nobody. A database that cannot be reached is not ignored: it
is an error on a public route as on any other.

The cost is two queries for each signed-in request. They are not cached. A
cache would bring back exactly the window the checks close.

## Refreshing, step by step

`POST /auth/token/refresh` with `{ "refreshToken": "..." }`.

`TokenService.refresh` runs these checks in order. The first one that fails
ends the request with 401 `REFRESH_TOKEN_INVALID`.

| #   | The check                                            | If it fails                                        |
| --- | ---------------------------------------------------- | -------------------------------------------------- |
| 1   | Is it 43 characters of the right kind?               | Refused, with no query                             |
| 2   | Is there a row for its hash, in a session not ended? | Refused                                            |
| 3   | Is the row unused?                                   | **The session is ended**, then refused             |
| 4   | Is it still inside its 7 days?                       | Refused. The session is left alone                 |
| 5   | Does the member still have an account?               | The session is ended, then refused                 |
| 6   | Save the successor, then mark this token used        | If the mark changes no row: session ended, refused |
| 7   | Sign a new access token with the same `sid`          |                                                    |

The answer is a new pair, in the same shape as signing in. The client throws
the old refresh token away and keeps the new one.

Three details worth knowing:

- **Step 4 does not end the session.** A member who was away for 8 days has
  done nothing wrong. Their token has simply run out, and they sign in again.
- **Step 6 saves before it marks.** If the app stopped between the two, the
  member would still hold a token that works, and could try again.
- **Steps 6 and 7 happen together in the code.** The new access token is
  signed as soon as the successor is saved, and the old token is marked used
  after that. The table lists the mark first because it is the part that can
  still refuse the request.
- **The old access token is not cancelled by a normal refresh.** It belongs
  to the same session, which is still going, so it works until its own 15
  minutes are up. Only ending the session stops it early.

## Why a token used twice ends the whole session

This is the heart of the design, and it is called **reuse detection**.

A refresh token works once. So if a spent one ever comes back, two parties
must be holding it: the member's client, and someone who copied it. The
server cannot tell which is which. Both look the same from where it sits.

So it ends the session for both. Here is why that works, whichever of them
moved first.

**If the thief uses the stolen token first:**

1. Walter's client holds token A. A thief copies A.
2. The thief swaps A, and gets token B. A is now marked used.
3. Walter's client, which still holds A, tries to swap it.
4. A is already used. The server ends the session.
5. The thief's token B is in that session, so it is dead too. So is the
   thief's access token, on its next request.
6. Walter signs in again with his password, which the thief does not have.

**If Walter's client uses it first:**

1. Walter's client swaps A and gets B. A is now marked used.
2. The thief tries the copy of A.
3. A is already used. The server ends the session.
4. Walter is signed out too, and signs in again. The thief gets nothing.

Either way the thief is locked out within one refresh, and the worst that
happens to the member is typing a password. Without rotation, a stolen
refresh token would work quietly for the whole 30 days.

Ending the session logs a warning that names the member and the session, and
never the token.

## Two requests at the same moment

Two browser tabs, or a request that was retried, can send the same refresh
token twice within a millisecond. Both requests read the row at step 3, and
both see it unused. Something has to decide who was first.

The database decides, with one statement in
[RefreshTokensService.markUsed](../src/auth/refresh-tokens.service.ts):

```sql
UPDATE "refresh_token" SET "usedAt" = $1 WHERE "id" = $2 AND "usedAt" IS NULL
```

Postgres lets only one of the two change the row. That request gets "1 row
changed" and succeeds. The other gets "0 rows changed", which is a second use
like any other, so the session ends.

**There is no grace period, by choice.** Some systems allow a second use
within a few seconds. This one does not: a thief who replays inside that
window would get a working pair. The price is paid by the client, which must
never send two refreshes at once for one session.

## Signing out

**This device.** `POST /auth/token/revoke` with `{ "refreshToken": "..." }`.

- It finds the row for that token and marks every row of its family revoked.
- That session's access token gets 401 on its next request.
- The member's other devices are untouched.
- The route is public, so a client can sign out with an access token that has
  already expired.
- It answers 204 for a real token and for nonsense alike. A different answer
  would tell a caller whether a token they hold is real. A body the DTO
  refuses is a plain 400, as on any route: no `refreshToken`, an empty one,
  one that is not a string, or one over 1,000 characters.
- A spent token of the session works too, so a client that kept an old one
  can still sign out.

**Every device.** `POST /auth/token/revoke-all`, with the access token as the
bearer token.

- It marks every row the member has revoked, whichever session it is in.
- The caller is signed out too.
- The user id comes from the access token, never from the body, so a caller
  can only ever sign themselves out.
- A session started afterwards is not affected. The member can sign in again
  straight away.

## Everything that ends a session

| What happened                          | Which sessions end  | Where in the code                   |
| -------------------------------------- | ------------------- | ----------------------------------- |
| `POST /auth/token/revoke`              | That one            | `TokenService.revoke`               |
| `POST /auth/token/revoke-all`          | All of the caller's | `TokenService.revokeAll`            |
| A refresh token used twice             | That one            | `TokenService.refresh`, step 3 or 6 |
| The member changed their password      | All of the member's | `UsersService.updateUser`           |
| An admin changed the member's password | All of the member's | `UsersService.updateUser`           |
| The member reset a forgotten password  | All of the member's | `UsersService.updateUser`           |
| The account was closed                 | All of the member's | `UsersService.deleteUser`           |
| 30 days passed since sign-in           | That one            | `familyExpiresAt`                   |
| 7 days passed with no refresh          | That one, in effect | `expiresAt`                         |

In every row but the last, the access token stops on the next request. That
includes the 30-day end: a refresh on day 29 hands out an access token that
could outlast the session by a few minutes, and the guard's third check stops
it at the session's end. In the last row there is no access token left to
stop. Seven days with no refresh means the last one ran out long ago.

**A password change and the end of its sessions are one transaction.** Either
both happen or neither does. If they were two separate writes and the second
failed, the old refresh tokens would go on working, which is the one thing a
password change must stop. Closing an account works the same way.

**A restored account comes back with no sessions.** When an admin restores a
closed account, the member signs in to it again. The tokens they held when it
was closed stay dead.

**A member who changes their own password is signed out everywhere**, on the
device they used too. They sign in again with the new password. Whoever was
signed in with the old one, the member or somebody else, has to know the new
one to get back in.

## What a client has to do

The only client planned is the Nuxt server. Its side of the bargain:

1. **Keep both tokens where page scripts cannot read them.** Two `httpOnly`
   cookies. See [context/frontend-architecture.md](../context/frontend-architecture.md).
2. **Send the access token with every API call.**
3. **Refresh when the access token has run out.** Either a little before
   `expiresIn` seconds have passed, or on the first 401 `TOKEN_INVALID`.
4. **Keep the new refresh token from every answer**, and throw the old one
   away. The old one is spent.
5. **Send one refresh at a time for a session.** Two at once ends the
   session. Keep one pending request for each refresh token and have later
   callers wait for it.
6. **On 401 `REFRESH_TOKEN_INVALID`, give up and send the member to sign in.**
   Do not retry it. Nothing will make that token work again.

## The answers when something is refused

| Answer                      | It means                                                   | What a client does           |
| --------------------------- | ---------------------------------------------------------- | ---------------------------- |
| 401 `BAD_CREDENTIALS`       | Wrong username, email or password at sign-in               | Shows the sign-in error      |
| 401 `TOKEN_MISSING`         | No `Authorization: Bearer` header on a route that needs it | Sends the member to sign in  |
| 401 `TOKEN_INVALID`         | The access token is expired, forged, or its session ended  | Refreshes once, then retries |
| 401 `REFRESH_TOKEN_INVALID` | The refresh token cannot be swapped, for any reason        | Sends the member to sign in  |
| 429 `RATE_LIMITED`          | More than 5 sign-in tries in 15 minutes for one account    | Waits for `Retry-After`      |

**One answer for every failed refresh.** Unknown, expired, used, signed out:
all get the same code and the same message. A client does the same thing in
each case, and telling them apart would only help someone trying tokens, or
tell a thief that the theft was seen.

## Why it is built this way

**Why is the refresh token random text and not a second JWT?**
The course signs a second JWT. A random token is simpler and safer here:

- It cannot be mistaken for an access token. A JWT refresh token needs its
  own audience so the guard refuses it. Random text is refused by its shape.
- It has to be looked up in the table anyway, to see whether it was used. So
  a signature would add nothing.
- This repo's password reset link already works the same way, and the two
  share [src/auth/one-time-token.ts](../src/auth/one-time-token.ts).

**Why store a hash and not the token?**
Because a database gets read by more people than it should: backups, logs,
a careless query. A hash is useless to all of them.

**Why SHA-256 and not bcrypt, as for passwords?**
bcrypt is slow on purpose, to make guessing a short password costly. A token
is 32 random bytes. There is nothing to guess, so a fast hash is enough, and
a fast hash can be found by an index.

**Why does every time come from the app's clock?**
The access token's `iat` is written by the app. If the rows used the
database's clock, two machines a second apart would disagree about what came
first. So `TokenService` reads the time once, with `getUtcNow` from
`@northguild/gmt`, and passes it down. No query on this table uses
`CURRENT_TIMESTAMP`.

**Why keep revoked rows and not delete them?**
Two reasons. A successor saved a moment after the revocation is still
covered, because the check is "is any row of this family revoked". And a
revoked token can be told from one that never existed.

**Who cleans the table up?**
`RefreshTokensService.save` does, each time it adds a row: it deletes the
rows of every session that has passed `familyExpiresAt`. So the table cleans
itself whenever someone signs in or refreshes, which is also the only time it
grows.

**Does Postgres not delete old rows by itself?**
No. Postgres has no setting to expire a row after a time, as Redis and a
MongoDB TTL index do. What it does by itself is `VACUUM`, and that is a
different job: when the app deletes a row, Postgres only marks it dead, and
the autovacuum process frees the space later. Autovacuum decides nothing
about which rows go. If the app sat idle, the expired rows would wait until
the next sign-in. That costs a little disk and nothing else, because an
expired row cannot be used. Cleanup that does not depend on traffic would
need a scheduled job: `@nestjs/schedule` in the app, or `pg_cron` in the
database.

**Why does the session check not count rows?**
A session gains a row with every refresh, and keeps them until its end. A
client that refreshed every 15 minutes for 30 days would have about 2,900.
The guard asks about the session on every request, so it must not read them
all. `isSessionLive` asks two yes-or-no questions, each of which stops at the
first row it finds: is any row of this session inside its time, and is any
row revoked. One index, on `familyId` and `revoked` together, answers both.

**Where did the design come from?**
The NestJS authentication docs describe it, and `TokenService` uses their
method names: `issue`, `refresh`, `revoke`, `revokeAll`. The official package
`@nestjs/authentication` implements the same thing. Its 0.1.0 release was
three days old when this was built, and it does not end an access token with
its session, so this is written by hand. The matching names keep a later move
small.

## The settings

All three are in seconds. [src/config/env.validate.ts](../src/config/env.validate.ts)
holds the rules.

| Variable                   | Default   | That is    | Rule                                     |
| -------------------------- | --------- | ---------- | ---------------------------------------- |
| `JWT_EXPIRES_IN`           | `900`     | 15 minutes | At least 1                               |
| `REFRESH_TOKEN_EXPIRES_IN` | `604800`  | 7 days     | At least 60                              |
| `SESSION_EXPIRES_IN`       | `2592000` | 30 days    | Not less than `REFRESH_TOKEN_EXPIRES_IN` |

An env file that sets one of these wins over the default.

## Where the code is

| File                                                                          | Its job                                                                       |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [src/auth/tokens.controller.ts](../src/auth/tokens.controller.ts)             | The four routes                                                               |
| [src/auth/auth.service.ts](../src/auth/auth.service.ts)                       | `signIn`: check the password, start the session, check again                  |
| [src/auth/token.service.ts](../src/auth/token.service.ts)                     | The rules: `issue`, `refresh`, `revoke`, `revokeAll`                          |
| [src/auth/refresh-tokens.service.ts](../src/auth/refresh-tokens.service.ts)   | The queries on `refresh_token`. It decides nothing                            |
| [src/auth/refresh-token.entity.ts](../src/auth/refresh-token.entity.ts)       | The table                                                                     |
| [src/auth/refresh-tokens.module.ts](../src/auth/refresh-tokens.module.ts)     | Lets three modules share that service with no cycle                           |
| [src/auth/one-time-token.ts](../src/auth/one-time-token.ts)                   | Makes a random token, and hashes one                                          |
| [src/shared/guards/jwt-auth.guard.ts](../src/shared/guards/jwt-auth.guard.ts) | The three checks on every signed-in request                                   |
| [src/shared/guards/auth-user.ts](../src/shared/guards/auth-user.ts)           | `JwtPayload` and `jwtPayloadFor`: what goes in the JWT                        |
| [src/users/users.service.ts](../src/users/users.service.ts)                   | `getUserForToken`, and ending sessions on a password change or closed account |
| [test/tokens.e2e-spec.ts](../test/tokens.e2e-spec.ts)                         | The flows in this document, over real HTTP and the real database              |

**Why `RefreshTokensService` is its own module.** Three places need it:
`AuthModule` to issue tokens, `UsersModule` to end sessions, and `AppModule`
for the guard. `AuthModule` imports `UsersModule`, so `UsersModule` cannot
import `AuthModule` back. A small module that depends only on TypeORM can be
imported by all three.

## How the course lessons map

| Lesson                   | In the course                           | Here                                          |
| ------------------------ | --------------------------------------- | --------------------------------------------- |
| 100, sign token          | `signToken`, used for both tokens       | `TokenService.signToken`, access token only   |
| 101, generate tokens     | Returns `{ token, refreshToken }`       | `TokenService.issue`                          |
| 102, refresh token API   | `POST /auth/refresh-token`              | `POST /auth/token/refresh`, `RefreshTokenDto` |
| 103, refresh token logic | Verify the JWT, load the user, re-issue | `TokenService.refresh`, seven checks          |

Two things differ from the course, both by choice:

- **The routes and keys follow the NestJS docs**: `/auth/token` and
  `accessToken`, where the course has `/auth/login` and `token`.
- **The refresh token is opaque and stored.** The course's is a second JWT
  that the server does not store, so it cannot be ended, and using it twice
  goes unnoticed.

## Try it by hand

The examples use port 3000. Use the `PORT` from your `.env`. They need `jq`.

Sign in and keep the pair:

```bash
PAIR=$(curl -s -X POST http://localhost:3000/auth/token \
  -H "Content-Type: application/json" \
  -d '{"identifier":"walter","password":"secret123"}')

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
```

Now play the thief. Send the old refresh token a second time:

```bash
curl -s -X POST http://localhost:3000/auth/token/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH\"}"
# 401 REFRESH_TOKEN_INVALID

curl -s http://localhost:3000/users/me -H "Authorization: Bearer $NEW_ACCESS"
# 401 TOKEN_INVALID: the session is over, and the newest access token with it
```

What each step answered when this was run:

| Step                                          | Answer                                  |
| --------------------------------------------- | --------------------------------------- |
| Sign in                                       | 200, with the three keys                |
| `GET /users/me` with the access token         | 200                                     |
| Refresh                                       | 200, with a new pair                    |
| The first access token, after that refresh    | 200, until it expires                   |
| The old refresh token, sent again             | 401 `REFRESH_TOKEN_INVALID`             |
| The newest access token, after that           | 401 `TOKEN_INVALID`                     |
| The newest refresh token, after that          | 401                                     |
| Sign in again, then `POST /auth/token/revoke` | 204                                     |
| That session's access token                   | 401                                     |
| `revoke` with a made-up token                 | 204                                     |
| Sign in again, then `revoke-all`              | 204, and the access token then gets 401 |

To watch the table while you do it, in pgAdmin or `psql`:

```sql
SELECT left("id", 8) AS hash, left("familyId"::text, 8) AS session,
       "usedAt", "expiresAt", "revoked"
FROM "refresh_token"
ORDER BY "createdAt" DESC
LIMIT 10;
```

`pnpm dev:token` is still the easy way to try other routes. Its token lasts
30 days and belongs to no session, so the guard skips check 3 for it. Only
the app can sign one.

## What it does not do

- **No list of "your devices".** A member can sign out everywhere, but cannot
  see their sessions or pick one to end.
- **No cookies.** The API is bearer-only. The Nuxt server will hold the
  cookies.
- **No notice to the member** when a session ends because a token was used
  twice. It is in the server log only.
- **A token signed in the same second as a password change survives the
  password check.** A JWT records only the second it was signed in. The
  session check still stops it, since a password change ends every session.
- **Signing out does not stop a `pnpm dev:token` token.** It belongs to no
  session, so there is nothing to end. It lasts its 30 days unless the
  account is closed or its password changes. The command refuses to run in
  production, and does run on staging.
- **Spent rows are kept for the whole session**, up to 30 days, though each
  token lasted 7. That is what lets a very old token be recognised as used
  when it comes back.

## Further reading

- NestJS docs, [Authentication](https://docs.nestjs.com/security/authentication):
  the access and refresh token section this design follows.
- [RFC 7519](https://www.rfc-editor.org/rfc/rfc7519): what a JWT is, and what
  `sub`, `iat`, `exp`, `aud` and `iss` mean.
- [RFC 7009](https://www.rfc-editor.org/rfc/rfc7009): token revocation. Section
  2.2 is why `revoke` answers the same for an unknown token.
- [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700): OAuth security best
  practice. Section 4.14 covers refresh token rotation and reuse detection.
- In this repo: [src/shared/guards/README.md](../src/shared/guards/README.md)
  follows one request through the guards, and
  [context/overview.md](../context/overview.md) lists the routes.
