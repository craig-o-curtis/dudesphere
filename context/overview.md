# Dudesphere

## App Concept

A social network where Dudeist priests and members share **abidings** — short posts of wisdom, chill thoughts, or guidance inspired by The Big Lebowski and Dudeist philosophy.

> "The Dude abides."

The API lives in `apps/api`, and every file path in this document is relative to it: `src/users/` means `apps/api/src/users/`.

## Architecture

- **Backend**: NestJS 12
- **PostgreSQL 18**, through TypeORM: users and their profiles
- **MongoDB 8**, through Mongoose: abidings (posts) and the hashtag registry
- **Docker Compose**: both databases run in containers; NestJS runs locally for hot-reload

The two databases share no foreign keys. An abiding names its author by a
plain `userId`, and the app joins the two in code.

## Database Schema

The entities and schemas are the source of truth: `src/users/user.entity.ts`,
`src/profiles/profile.entity.ts`, `src/abidings/abiding.schema.ts` and
`src/hashtags/hashtag.schema.ts`. Postgres changes go through migrations in
`src/database/migrations/`.

### PostgreSQL — `user` table

| Column              | Type                   | Description                                                                                                |
| ------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| `id`                | serial PK              | Auto-increment                                                                                             |
| `username`          | citext UNIQUE          | A login name. Up to 24 characters, no `@` and no whitespace. Shown to the member and to admins only        |
| `email`             | citext UNIQUE          | Up to 100 characters. A login name                                                                         |
| `password`          | varchar(255)           | scrypt hash; never returned. Older rows may hold a bcrypt hash until that member signs in                  |
| `role`              | enum `admin` or `user` | Defaults to `user`                                                                                         |
| `passwordChangedAt` | timestamptz, nullable  | When the password was last changed or reset. Null means never. An access token signed before it is refused |
| `createdAt`         | timestamptz            | Set by the database when the row is created                                                                |
| `updatedAt`         | timestamptz            | Moved by TypeORM on every update                                                                           |
| `deletedAt`         | timestamptz, nullable  | Soft delete. Null means the user is live                                                                   |

### PostgreSQL — the sign-in tables

`@nestjs/authentication` keeps its state in three tables, which the app
writes through `TypeOrmAuthenticationStore` in `src/typeorm/`. They are the
tables of the NestJS docs, in `src/typeorm/authentication.entities.ts`.
[reference/TOKEN_FYI.md](../reference/TOKEN_FYI.md) is the short guide to
the tokens, and
[reference/TOKENS_AND_SESSIONS.md](../reference/TOKENS_AND_SESSIONS.md) the
long one.

In all three, `user_id` is the user's id as text, with no foreign key, as in
the docs. Users are only soft-deleted, so no row is orphaned. A real delete
of a user must delete that user's rows here first.

**`refresh_tokens`**: one row for each refresh token handed out. The tokens of
one sign-in share a `family_id`.

| Column              | Type                  | Description                                                                                                           |
| ------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `id`                | text PK               | SHA-256 of the refresh token, in base64url. The token is not stored                                                   |
| `family_id`         | text                  | The sign-in this token belongs to. Indexed                                                                            |
| `user_id`           | text                  | Indexed                                                                                                               |
| `created_at`        | timestamptz           |                                                                                                                       |
| `expires_at`        | timestamptz           | This one token stops working at this instant: 7 days after it was made, or at `family_expires_at` if that comes first |
| `family_expires_at` | timestamptz           | Every token of the sign-in stops at this instant, 30 days after sign-in. Indexed                                      |
| `used_at`           | timestamptz, nullable | When the token was swapped for its successor                                                                          |
| `revoked`           | boolean               | True once the family was ended, such as by a sign-out, a password change or reset, or a reuse                         |
| `claims`            | jsonb, nullable       | What goes into every access token of the family: `amr` and `sid`                                                      |
| `sid`               | text, nullable        | The sign-in's id, a UUID, copied out of `claims`. The same on every row of the family. Indexed. Not in the docs       |

A family's rows are deleted once `family_expires_at` has passed, whenever
anyone signs in or refreshes.

**`email_tokens`**: one row for each password reset link that can still be
used. `purpose` is `password-reset`; email verification would add
`email-verification`. `fingerprint` ties the link to the password hash it was
sent for, so any password change kills it. Using a link deletes its row.

**`sessions`**: browser sessions with a cookie. The API hands out bearer
tokens only, so nothing writes here. The package still needs the table,
because a reset and a sign-out everywhere end sessions too.

### PostgreSQL — `profile` table

One per user, created in the same transaction as the user.

| Column            | Type                  | Description                                        |
| ----------------- | --------------------- | -------------------------------------------------- |
| `id`              | serial PK             | Auto-increment                                     |
| `userId`          | int UNIQUE, FK        | References `user.id`, `ON DELETE CASCADE`          |
| `displayName`     | citext UNIQUE         | The one name other members see. 2 to 50 characters |
| `bio`             | text, nullable        |                                                    |
| `profileImageUrl` | varchar, nullable     | A URL                                              |
| `isDude`          | boolean               | Dudeist flag. Defaults to `false`                  |
| `ordainedDate`    | timestamptz, nullable | An instant in UTC                                  |
| `createdAt`       | timestamptz           | Set by the database                                |
| `updatedAt`       | timestamptz           | Moved by TypeORM on every update                   |
| `deletedAt`       | timestamptz, nullable | Set and cleared together with its user's           |

**Username and display name.** A username is a login name. Only the member
and admins ever see it. The display name is what everyone else sees, on the
profile and on every abiding. It is required at sign up and unique, ignoring
letter case, so one member cannot pass as another. Before it is checked or
stored it is put in Unicode form NFKC, each run of whitespace becomes one
space, and the ends are trimmed. Control characters and characters nobody can
see are refused. A soft-deleted member's name stays reserved. The rules are in
`src/shared/utils/display-name.ts`.

Every timestamp column is `timestamptz`, so a value means the same instant on
any machine. The app reads and writes them as ISO 8601 UTC strings and never
holds a JavaScript `Date`.

### MongoDB — `abidings` collection

| Field       | Type               | Description                                                   |
| ----------- | ------------------ | ------------------------------------------------------------- |
| `_id`       | ObjectId           | Auto-generated                                                |
| `userId`    | number             | The author's `user.id`                                        |
| `message`   | string             | The abiding, 1 to 280 characters                              |
| `imageUrl`  | string or null     | A URL                                                         |
| `replyToId` | string or null     | The `_id` of the abiding this one replies to                  |
| `hashtags`  | string[]           | Normalized slugs, derived from `message` — never set directly |
| `createdAt` | date               | Set by Mongoose; returned as an ISO string                    |
| `updatedAt` | date               | Set by Mongoose; returned as an ISO string                    |
| `deletedAt` | ISO string or null | Set when the author is soft-deleted, cleared when restored    |

### MongoDB — `hashtags` collection

The canonical list of every tag ever used, so a tag can be listed or looked up
without scanning abidings.

| Field         | Type               | Description                              |
| ------------- | ------------------ | ---------------------------------------- |
| `_id`         | ObjectId           | Auto-generated                           |
| `slug`        | string, unique     | Normalized tag — the lookup key          |
| `display`     | string             | Casing as first written, e.g. "Sunday"   |
| `firstUsedAt` | ISO string         | Set once on insert                       |
| `deletedAt`   | ISO string or null | Soft delete by an admin. Null means live |

### Why two collections and no join table

A relational schema would use `abiding`, `hashtag` and an `abiding_hashtag`
join table, with a foreign key at each end. That does not carry over here,
because abidings live in Mongo and users live in Postgres. A Postgres join
table would hold Mongo `_id` values as plain strings, with no foreign key
behind them and no cascade on delete.

A document store does not need the third table. A multikey index over
`abidings.hashtags` answers "which abidings have tag X" in one index hit, and
the array itself answers "which tags does this abiding have". The array is
the join.

The `hashtags` collection is still needed, for two things the array cannot do:

1. **List every tag**, for a dropdown. Without a registry that is a scan of
   every abiding.
2. **Store something about a tag**: its first casing, when it first appeared,
   whether an admin has hidden it.

Costs accepted with this design:

- The database cannot tell that `#Sunday` and `#sunday` are one tag. One
  normalizer in `src/shared/utils/hashtag.ts` is the only guard, so every
  write path must go through it.
- The registry is written after the abiding, not in a transaction with it. If
  the abiding is saved and the registry write fails, the abiding carries a tag
  the registry does not list. It heals the next time anyone uses the tag, and
  `pnpm --filter @dudesphere/api backfill:hashtags` repairs it in bulk. `HashtagsService.registerTags`
  logs and swallows its own failures for this reason: a registry problem must
  not cost a user their post.
- A tag row is never removed, even when no abiding uses it. An admin can hide
  one, which is a soft delete, and restore it.

## API Endpoints

Every route needs an access token unless it is marked `@Public()`. An access
token comes from `POST /auth/token`.

Auth is built on `@nestjs/authentication` and `@nestjs/authorization`, the way
https://docs.nestjs.com/security/authentication and
https://docs.nestjs.com/security/authorization build it. The routes and their
names are the docs'.

Every list route takes `?limit=` (1 to 100, default 10) and `?page=` (from 1,
default 1). It answers with `data`, `meta` and `links`, where `links.next` is
the next page or `null`.
[src/shared/pagination/README.md](../apps/api/src/shared/pagination/README.md) shows the
full shape.

### Auth

| Method | Endpoint                | Access | Description                                                |
| ------ | ----------------------- | ------ | ---------------------------------------------------------- |
| POST   | `/auth/sign-up`         | Public | Sign up. Creates the user and a profile                    |
| POST   | `/auth/password/forgot` | Public | Email a password reset link. 202 for any well-formed email |
| POST   | `/auth/password/reset`  | Public | Set a new password with the link. 204                      |

### Tokens

| Method | Endpoint                    | Access | Description                                                     |
| ------ | --------------------------- | ------ | --------------------------------------------------------------- |
| POST   | `/auth/token`               | Public | Sign in with `{ identifier, password }`. 200                    |
| POST   | `/auth/token/refresh`       | Public | Swap `{ refreshToken }` for a new pair. 200                     |
| POST   | `/auth/token/revoke`        | Public | Sign out this device, with `{ refreshToken }`. 204              |
| POST   | `/auth/sign-out`            | Token  | Sign out the sign-in this access token belongs to. No body. 204 |
| POST   | `/auth/sign-out-everywhere` | Token  | Sign out every device of the caller. 204                        |

Signing in and refreshing both answer
`{ "accessToken": "...", "refreshToken": "...", "expiresIn": 900 }`.
[reference/TOKENS_AND_SESSIONS.md](../reference/TOKENS_AND_SESSIONS.md) walks
through each flow step by step.

A member holds two tokens:

- **The access token** is a JWT. It goes with every request as
  `Authorization: Bearer <accessToken>` and lasts 15 minutes. `expiresIn` is
  that lifetime in seconds. It holds the member's id, the sign-in's id
  (`sid`) and how they signed in (`amr`), and nothing that can change.
- **The refresh token** is 43 random characters, not a JWT. It goes to two
  routes only, `POST /auth/token/refresh` and `POST /auth/token/revoke`, and
  lasts 7 days. The database keeps a hash of it, never the token.

The refresh tokens of one sign-in are a family. A family lasts as long as the
member keeps refreshing, and 30 days at most.

**Two ways to sign out one device.** `POST /auth/token/revoke` finds the
family by its refresh token. `POST /auth/sign-out` finds it by the access
token's `sid`, for a client that holds the access token but not the refresh
token where it signs out, such as the web app's sign-in action. Both end the
whole family, and its access tokens on the next request, and leave the
member's other sign-ins alone. `POST /auth/sign-out` needs a live access
token, so a second call with the same token gets 401. A dev token belongs to
no sign-in: `POST /auth/sign-out` answers 204 and ends nothing. The docs'
`/auth/sign-out` ends a browser session by its cookie instead, and is public.
`SignInsRepository.endSignIn` makes the write; the package has no way to end
a family by `sid`.

**A refresh token works once.** Swapping it returns a new pair, and the client
keeps the new refresh token. A client must send one refresh at a time. If a
refresh token is used a second time, two parties hold it, so the whole family
ends and the member signs in again.

On every request `JwtAuth` reads the member from the database. So the role is
always the current one, and a client that needs it asks `GET /users/me`. The
same read ends the access token at once, with a 401, when:

- the password is changed or reset;
- the account is closed, by the member or by an admin.

**Ending a sign-in ends its access tokens too.** Every access token carries
its sign-in's id, `sid`. On every request `JwtAuth` also asks
`SignInsRepository.isLive` (`src/typeorm/sign-ins.repository.ts`) whether
that sign-in is still going, beside the member read. So signing out this
device (either route), signing out everywhere, a refresh token used twice, a password
change or reset, and a closed account all stop the access tokens on the
next request, with a 401. A restored account keeps them stopped: the member
signs in again. This is not in the NestJS docs,
where an access token works until it expires. It costs one indexed read on
each signed-in request.

**A password change and the end of its sign-ins are one transaction.**
`UsersService.updateUser`, `deleteUser` and `restoreUser`, and
`PasswordResetMailer.updatePassword`, call
`SignInsRepository.endAllForUser` inside their own transaction. Either the
change and the end of the sign-ins are both saved, or neither is. Not in the
docs either.

The refusals come from the packages:

- No token: 401 with `errorCode` `missing_credentials`.
- A bad, expired, closed-account or signed-out token: 401 whose `message`
  says why, and a `WWW-Authenticate` header.
- A refresh token that will not swap: 401 "Refresh token invalid", "expired"
  or "reused". The client sends the member to sign in.
- A route the member may not call: 403 "Forbidden". A member who is no longer
  an admin gets it on admin routes from the next request, with the same token.

Each route declares who may call it. `@Public()` is anyone. `@Can.Anyone()` is
any signed-in member. `@Can(UserPolicy, "viewAll")` and the like run a policy,
in `src/users/user.policy.ts` and `src/hashtags/hashtag.policy.ts`. A route
that declares nothing is refused, and `src/auth/route-access.spec.ts` fails.

The sign-up body is
`{ "username": "...", "email": "...", "password": "...", "profile": { "displayName": "..." } }`.
`profile` may also carry `bio`, `profileImageUrl`, `isDude` and `ordainedDate`.
A display name in use answers 409 `DISPLAY_NAME_TAKEN`, as a taken email or
username answers `EMAIL_TAKEN` or `USERNAME_TAKEN`. A new password is 12 to
128 characters, as in the docs. Sign-in sets no minimum, so a password set
when 6 was enough still works.

The sign-in body is `{ "identifier": "...", "password": "..." }`. The docs sign
in with an email; here `identifier` is a username or an email. A value with `@`
is looked up as an email, and any other value as a username. Spaces around it
are dropped.

`username` and `email` are `citext` columns, so both ignore letter case:
`Walter` and `walter` are one username, at sign up and at sign-in. The casing
typed at sign up is what is stored and shown. A username cannot hold `@`, which
is what lets sign-in tell the two apart, and cannot hold whitespace.

Every failed sign-in answers 401 `BAD_CREDENTIALS` with one message, so the
response does not say which usernames and emails have an account.

Once the sign-in has started, `TokensController.issue` checks once more,
with `CredentialsService.stillValid`, that the account is open and
`passwordChangedAt` has not moved since the password was checked. If it has,
the new sign-in is ended and the answer is the same 401. This catches a
password change that lands during the tenth of a second the check takes.
Not in the docs.

Passwords are hashed with scrypt by the package's `PasswordHasher`. Hashes
stored before were bcrypt. Those still sign in, and `CredentialsService`
replaces each with a scrypt hash at that sign-in.

### Forgot password

1. `POST /auth/password/forgot` with `{ "email": "..." }` answers 202 with no
   body, for any well-formed email. It starts the work and does not wait for
   it, so the answer is the same, and as fast, whether or not the address has
   an account.
2. If a live user has that email, they are sent a link to
   `<FRONTEND_URL>/reset-password?token=<token>`. It works once, for
   `PASSWORD_RESET_EXPIRES_IN` seconds, 30 minutes by default, and only while
   the password is unchanged. Asking again sends a new link and leaves the
   earlier one working. Using either kills the other.
3. `POST /auth/password/reset` with `{ "token", "password" }` answers 204 and
   sets the password. `password` follows the sign-up rules.
4. A token that is wrong, used or expired gets one answer: 400
   `RESET_TOKEN_INVALID`, "Invalid or expired link".

The package's `PasswordResetService` owns the links. `PasswordResetMailer` in
`src/auth/` finds the account, sends the email and stores the new hash. Mail
goes out through `MailProvider` in `src/mail/`, over SMTP with Nodemailer. In
development the `MAIL_*` defaults send to the Mailpit container, which shows
every email at http://localhost:8025 and delivers none.

A reset stores the hash, stamps `passwordChangedAt` and ends every sign-in
of the member, in one transaction in `PasswordResetMailer.updatePassword`.
So every refresh token and every access token they held stops.

The web pages (AUTH-9) are `/forgot-password`, which asks for the email and
redirects to `/forgot-password/sent`, and `/reset-password?token=...`, which
asks for the new password twice. A successful reset redirects to
`/login?reset=1`, which shows "Password changed. Roll in with the new one."
`FRONTEND_URL` already defaults to `http://localhost:3001`, the web origin, so
the emailed link opens the Next page.

### Rate limits

| Route                               | Limit           | Counted per                                                   |
| ----------------------------------- | --------------- | ------------------------------------------------------------- |
| Every route                         | 100 a minute    | IP address, or account and IP where the body names an account |
| A route whose body names an account | 100 a minute    | IP address alone, as well                                     |
| `POST /auth/token`                  | 5 in 15 minutes | identifier and IP together                                    |
| `POST /auth/password/forgot`        | 3 in 15 minutes | email and IP together                                         |

A request over a limit gets 429 `RATE_LIMITED` and a `Retry-After` header with
the seconds to wait. Sign-in counts every try, right or wrong. The identifier
is counted as sign-in reads it, so `Walter` and `walter` share one count. A
username and an email are counted apart, because the limiter sees only what
was typed.

Where the body names an account, the docs' count is kept for that account
and IP together. On its own, that would let an address that names a new
account on every try go on for ever. So a second count, `ip`, which the docs
do not have, holds each address to 100 a minute on those routes, however
many accounts it names. It sends its own headers, such as
`X-RateLimit-Remaining-ip`.

The limiter counts the caller's IP address as Express reports it. `main.ts`
sets `trust proxy` to `loopback`, so behind a proxy on the same machine each
caller is counted by their own address. A proxy elsewhere needs its address
there instead.

`AuthThrottlerGuard` in `src/auth/` does this, on top of `@nestjs/throttler`.
The counts are kept in the app's memory: they reset on a restart and are not
shared between two copies of the app. `THROTTLE_ENABLED=false` turns it off,
which only the e2e suite does.

### Users (PostgreSQL)

| Method | Endpoint             | Access        | Description                                 |
| ------ | -------------------- | ------------- | ------------------------------------------- |
| POST   | `/users`             | Admin         | Create a user and a profile                 |
| GET    | `/users`             | Admin         | List users, paginated, in id order          |
| GET    | `/users/me`          | Token         | The caller's own user                       |
| GET    | `/users/:id`         | Self or admin | One user. It carries the email and the role |
| PATCH  | `/users/me`          | Token         | Update the caller's own user                |
| PATCH  | `/users/:id`         | Admin         | Update any user                             |
| DELETE | `/users/me`          | Token         | Soft-delete the caller's own account        |
| DELETE | `/users/:id`         | Admin         | Soft-delete any user                        |
| POST   | `/users/:id/restore` | Admin         | Restore a soft-deleted user                 |

### Profiles (PostgreSQL)

| Method | Endpoint             | Access         | Description                 |
| ------ | -------------------- | -------------- | --------------------------- |
| GET    | `/profiles`          | Token          | List profiles, paginated    |
| GET    | `/profiles/me`       | Token          | The caller's own profile    |
| GET    | `/profiles/user/:id` | Token          | The profile of one user     |
| GET    | `/profiles/:id`      | Token          | One profile                 |
| PATCH  | `/profiles/me`       | Token          | Update the caller's profile |
| PATCH  | `/profiles/:id`      | Owner or admin | Update a profile            |

A profile carries `displayName` and no username. Changing `displayName` to one
in use answers 409 `DISPLAY_NAME_TAKEN`.

### Abidings (MongoDB)

| Method | Endpoint                          | Access          | Description                                                                        |
| ------ | --------------------------------- | --------------- | ---------------------------------------------------------------------------------- |
| GET    | `/abidings`                       | Public          | List abidings, paginated, newest first                                             |
| GET    | `/abidings?userId=X`              | Public          | Filter by author                                                                   |
| GET    | `/abidings?hashtag=X`             | Public          | Filter by tag. Up to 10, comma-separated, match any                                |
| GET    | `/abidings?startDate=X&endDate=Y` | Public          | Filter by when it was created. UTC instants. The start is included, the end is not |
| GET    | `/abidings/me`                    | Token           | The caller's own abidings, paginated, newest first                                 |
| GET    | `/abidings/:id`                   | Public          | One abiding                                                                        |
| POST   | `/abidings`                       | Token           | Post an abiding, or a reply with `replyToId`                                       |
| PATCH  | `/abidings/:id`                   | Author or admin | Edit an abiding                                                                    |
| DELETE | `/abidings/:id`                   | Author or admin | Delete an abiding                                                                  |

Every abiding in a response carries its author's `userId` and `displayName`. It
never carries the username. The name is read from the profile on each request,
so a member who changes it sees the new one on their old abidings at once.

### Hashtags (MongoDB)

| Method | Endpoint                  | Access | Description                   |
| ------ | ------------------------- | ------ | ----------------------------- |
| GET    | `/hashtags`               | Public | Live tags, paginated, by slug |
| GET    | `/hashtags/:slug`         | Public | One tag, or 404               |
| DELETE | `/hashtags/:slug`         | Admin  | Hide a tag (soft delete)      |
| POST   | `/hashtags/:slug/restore` | Admin  | Bring a hidden tag back       |

## Roles

| Role    | Description                                             |
| ------- | ------------------------------------------------------- |
| `admin` | Seeded by `pnpm seed:run`. Manages users and hashtags.  |
| `user`  | Everyone who signs up. Posts abidings, edits their own. |

## MVP Scope

For what comes next, see Epic Lebowski in [epic-lebowski/index.md](epic-lebowski/index.md).

- [x] PostgreSQL + MongoDB via Docker Compose
- [x] User CRUD with roles (admin seeded)
- [x] Auth on `@nestjs/authentication`: sign up with `POST /auth/sign-up`,
      sign in with `POST /auth/token` by username or email
- [x] Route access on `@nestjs/authorization`: `@Can()` policies
- [x] Rate limiting on every route, tighter on sign-in
- [x] Forgot password: a reset link by email
- [x] Refresh tokens and sign-out
- [x] Abidings CRUD with replies
- [x] ISO string timestamps on all entities
- [ ] A priest role and priests-only endpoints (future)
- [ ] Abide University integration (future)

## Deferred work

Decided on, not built. Each note says how to build it when its time comes.

**Trending tags.** Aggregate with `$unwind: "$hashtags"` over a recent
`createdAt` window, then cache the result. Do not add a stored counter. A
count in one database that describes rows in another will drift, and no
transaction spans Postgres and Mongo to keep it honest.

**Following a tag.** This belongs in Postgres, because the relation has
`user.id` on one end. Here the textbook join table does fit, since both ends
would live in one database: a `hashtag` table plus a `user_hashtag_follow`
join table with `ON DELETE CASCADE`. That gives cleanup on user delete inside
the existing Postgres transaction and keeps Mongo out of it.

A tag would then exist in both stores, keyed by slug: the Mongo registry for
"what tags exist and what do abidings use", the Postgres table for "who
follows what". That duplication is acceptable only because the slug is stable
and neither side needs the other's rows to answer its own questions. The
normalized slug is the only value that crosses between the two stores. No ids
cross. `src/abidings/user-abidings.service.ts` explains why nothing more
should be added to the list of things that can leave the stores disagreeing.

**Dude location.** Opt-in, off by default, and coarse on purpose. The
frontend plan is the "Sphere" section of
[frontend-architecture.md](./frontend-architecture.md). The backend side:

- It lives in Postgres, on the `profile` row, because the relation is keyed
  by `user.id` and the soft delete must travel with the user. Three new
  columns: `locationMode` enum `off`, `anonymous` or `named`, default
  `off`; `locationCell` varchar(4), nullable; `locationLabel` varchar(100),
  nullable. One migration, and an index on `locationCell`.
- `locationCell` is a geohash of length 4, a box of roughly 20 by 40 km. The
  browser rounds before sending. The API validates that the value is 4
  base-32 geohash characters and rejects anything longer. The API never
  receives, stores or logs a latitude or longitude.
- `PUT /profiles/me/location` takes `{ mode, cell, label }`.
  `DELETE /profiles/me/location` sets the mode to `off` and nulls both
  columns. Nothing keeps history.
- `GET /sphere/cells` is public. It groups live profiles with mode
  `anonymous` or `named` by `locationCell` and returns `{ cell, count }` for
  cells with a count of 3 or more. The threshold protects a lone member in a
  small place. It is one `GROUP BY` with `HAVING count(*) >= 3`, cached for
  a minute.
- `GET /dudes/nearby?cell=` needs a token. It returns `named` profiles in
  that cell and its eight neighbors, paginated like every other list. The
  neighbor set is nine string literals from a geohash neighbor function, so
  the query is `WHERE "locationCell" IN (...)`. No PostGIS. The cells are
  too coarse for real distance, and adding an extension to the Postgres
  image for nine string compares is not worth it.
- A soft-deleted user drops out of both queries through the existing
  `deletedAt` filter. A restore brings the row back as it was.

Cost accepted: "near" means the same or an adjacent cell, not a radius. Two
dudes 1 km apart on a cell edge are near. Two dudes 50 km apart inside one
wide cell are also near. That is the price of never holding a precise point.
