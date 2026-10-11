# The Dudesphere

## App Concept

A social network where Dudeist priests and members share **abidings** — short posts of wisdom, chill thoughts, or guidance inspired by The Big Lebowski and Dudeist philosophy.

> "The Dude abides."

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
| `password`          | varchar(255)           | bcrypt hash; never returned                                                                                |
| `role`              | enum `admin` or `user` | Defaults to `user`                                                                                         |
| `passwordChangedAt` | timestamptz, nullable  | When the password was last changed or reset. Null means never. An access token signed before it is refused |
| `createdAt`         | timestamptz            | Set by the database when the row is created                                                                |
| `updatedAt`         | timestamptz            | Moved by TypeORM on every update                                                                           |
| `deletedAt`         | timestamptz, nullable  | Soft delete. Null means the user is live                                                                   |

### PostgreSQL — `password_reset_token` table

One row for each password reset link that can still be used.

| Column      | Type               | Description                                               |
| ----------- | ------------------ | --------------------------------------------------------- |
| `id`        | serial PK          | Auto-increment                                            |
| `userId`    | int, FK to `user`  | `ON DELETE CASCADE`. Indexed                              |
| `tokenHash` | varchar(64) UNIQUE | SHA-256 of the token in the link. The token is not stored |
| `expiresAt` | timestamptz        | The link stops working at this instant                    |
| `createdAt` | timestamptz        | Set by the database when the row is created               |

A row is deleted when its link is used, so there is no "used" column.

### PostgreSQL — `refresh_token` table

One row for each refresh token handed out. The rows of one sign-in share a
`familyId`, and that family is the session.
[reference/TOKENS_AND_SESSIONS.md](../reference/TOKENS_AND_SESSIONS.md) explains
how they are used.

| Column            | Type                  | Description                                           |
| ----------------- | --------------------- | ----------------------------------------------------- |
| `id`              | varchar(64) PK        | SHA-256 of the refresh token. The token is not stored |
| `familyId`        | uuid                  | The session. Indexed together with `revoked`          |
| `userId`          | int, FK to `user`     | `ON DELETE CASCADE`. Indexed                          |
| `expiresAt`       | timestamptz           | This one token stops working at this instant          |
| `familyExpiresAt` | timestamptz           | The session ends at this instant. Indexed             |
| `usedAt`          | timestamptz, nullable | When the token was swapped for its successor          |
| `revoked`         | boolean               | True once the session was ended on purpose            |
| `createdAt`       | timestamptz           | Set by the database when the row is created           |

Rows are kept until their session's end, then deleted the next time anyone
signs in or refreshes.

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
  `pnpm backfill:hashtags` repairs it in bulk. `HashtagsService.registerTags`
  logs and swallows its own failures for this reason: a registry problem must
  not cost a user their post.
- A tag row is never removed, even when no abiding uses it. An admin can hide
  one, which is a soft delete, and restore it.

## API Endpoints

Every route needs an access token unless it is marked public. An access token
comes from `POST /auth/token`.

Every list route takes `?limit=` (1 to 100, default 10) and `?page=` (from 1,
default 1). It answers with `data`, `meta` and `links`, where `links.next` is
the next page or `null`.
[src/shared/pagination/README.md](../src/shared/pagination/README.md) shows the
full shape.

### Auth

| Method | Endpoint                | Access | Description                             |
| ------ | ----------------------- | ------ | --------------------------------------- |
| POST   | `/auth/signup`          | Public | Sign up. Creates the user and a profile |
| POST   | `/auth/forgot-password` | Public | Email a password reset link. Always 202 |
| POST   | `/auth/reset-password`  | Public | Set a new password with the link. 204   |

### Tokens and sessions

| Method | Endpoint                 | Access | Description                                        |
| ------ | ------------------------ | ------ | -------------------------------------------------- |
| POST   | `/auth/token`            | Public | Sign in with `{ identifier, password }`. 200       |
| POST   | `/auth/token/refresh`    | Public | Swap `{ refreshToken }` for a new pair. 200        |
| POST   | `/auth/token/revoke`     | Public | Sign out this device, with `{ refreshToken }`. 204 |
| POST   | `/auth/token/revoke-all` | Token  | Sign out every device of the caller. 204           |

Signing in and refreshing both answer
`{ "accessToken": "...", "refreshToken": "...", "expiresIn": 900 }`. The paths
and the keys are the ones the NestJS docs use.
[reference/TOKENS_AND_SESSIONS.md](../reference/TOKENS_AND_SESSIONS.md) walks
through each flow step by step, with the reasons for the design.

A member holds two tokens:

- **The access token** is a JWT. It goes with every request as
  `Authorization: Bearer <accessToken>` and lasts 15 minutes. `expiresIn` is
  that lifetime in seconds. It holds the member's id, their username and the
  id of their session, and nothing else.
- **The refresh token** is 43 random characters, not a JWT. It goes to two
  routes only, `POST /auth/token/refresh` and `POST /auth/token/revoke`, and
  lasts 7 days. The database keeps a hash
  of it, never the token.

One sign-in is one session. A session lasts as long as the member keeps
refreshing, and 30 days at most.

**A refresh token works once.** Swapping it returns a new pair, and the client
keeps the new refresh token. A client must send one refresh at a time for a
session. If a refresh token is used a second time, two parties hold it, so the
whole session ends and the member signs in again.

On every request the server reads the member and their session from the
database. So the role is always the current one, and a client that needs it
asks `GET /users/me`. The same read is why a session ends at once, access token
included, with 401 `TOKEN_INVALID`, when:

- the member signs out, on that device or on every device;
- one of the session's refresh tokens is used twice;
- the password is changed or reset. Every session of the member ends, and they
  sign in again with the new password;
- the account is closed, by the member or by an admin.

A refresh token that cannot be swapped gets 401 `REFRESH_TOKEN_INVALID`,
whatever the reason. The client sends the member to sign in.

A member who is no longer an admin gets 403 on admin routes from the next
request, with the same token.

The sign-up body is
`{ "username": "...", "email": "...", "password": "...", "profile": { "displayName": "..." } }`.
`profile` may also carry `bio`, `profileImageUrl`, `isDude` and `ordainedDate`.
A display name in use answers 409 `DISPLAY_NAME_TAKEN`, as a taken email or
username answers `EMAIL_TAKEN` or `USERNAME_TAKEN`.

The login body is `{ "identifier": "...", "password": "..." }`. `identifier` is
a username or an email. A value with `@` is looked up as an email, and any
other value as a username. Spaces around it are dropped.

`username` and `email` are `citext` columns, so both ignore letter case:
`Walter` and `walter` are one username, at sign up and at login. The casing
typed at sign up is what is stored and shown. A username cannot hold `@`, which
is what lets login tell the two apart, and cannot hold whitespace.

Every failed login answers 401 `BAD_CREDENTIALS` with one message, so the
response does not say which usernames and emails have an account.

### Forgot password

1. `POST /auth/forgot-password` with `{ "email": "..." }` answers 202 with no
   body, every time. It starts the work and does not wait for it, so the answer
   is the same, and as fast, whether or not the address has an account.
2. If a live user has that email, they are sent a link to
   `<FRONTEND_URL>/reset-password?token=<token>`. It works once, for
   `PASSWORD_RESET_EXPIRES_IN` seconds, 30 minutes by default. Asking again
   kills the earlier link.
3. `POST /auth/reset-password` with `{ "token", "password", "confirmPassword" }`
   answers 204 and sets the password. `password` follows the sign-up rules and
   `confirmPassword` must equal it.
4. A token that is wrong, used or expired gets one answer: 400
   `RESET_TOKEN_INVALID`, "Invalid or expired link".

`PasswordResetService` in `src/auth/` does this. Mail goes out through
`MailProvider` in `src/mail/`, over SMTP with Nodemailer. In development the
`MAIL_*` defaults send to the Mailpit container, which shows every email at
http://localhost:8025 and delivers none.

A reset ends every session of the member, the same as a password change does.

### Rate limits

| Route                        | Limit           | Counted per                |
| ---------------------------- | --------------- | -------------------------- |
| Every route                  | 100 a minute    | IP address                 |
| `POST /auth/token`           | 5 in 15 minutes | identifier and IP together |
| `POST /auth/forgot-password` | 3 in 15 minutes | email and IP together      |

A request over a limit gets 429 `RATE_LIMITED` and a `Retry-After` header with
the seconds to wait. Login counts every try, right or wrong. The identifier is
counted as login reads it, so `Walter` and `walter` share one count. A username
and an email are counted apart, because the limiter sees only what was typed.

The 100 a minute is counted for each route by itself. It runs on login and
forgot-password too, beside their tighter counts, so an address that names a
new account on every try is still stopped. Those two routes send a second set
of headers for the tighter count, such as `X-RateLimit-Remaining-account`.

The limiter counts the caller's IP address as Express reports it. Behind a
reverse proxy that is the proxy's address, so every caller shares one count
until Express is told to trust the proxy (`trust proxy`). Set that before a
deploy behind one.

`AuthThrottlerGuard` in `src/shared/guards/` does this, on top of
`@nestjs/throttler`. The counts are kept in the app's memory: they reset on a
restart and are not shared between two copies of the app. `THROTTLE_ENABLED=false`
turns it off, which only the e2e suite does.

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

- [x] PostgreSQL + MongoDB via Docker Compose
- [x] User CRUD with roles (admin seeded)
- [x] JWT auth: sign up with `POST /auth/signup`, sign in with `POST /auth/token`
      by username or email
- [x] Rate limiting on every route, tighter on login
- [x] Forgot password: a reset link by email
- [x] Refresh tokens, sessions and sign-out
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
