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

| Column      | Type                   | Description                                 |
| ----------- | ---------------------- | ------------------------------------------- |
| `id`        | serial PK              | Auto-increment                              |
| `username`  | varchar(24) UNIQUE     | Shown on abidings                           |
| `email`     | varchar(100) UNIQUE    | Login email                                 |
| `password`  | varchar(255)           | bcrypt hash; never returned                 |
| `role`      | enum `admin` or `user` | Defaults to `user`                          |
| `createdAt` | timestamptz            | Set by the database when the row is created |
| `updatedAt` | timestamptz            | Moved by TypeORM on every update            |
| `deletedAt` | timestamptz, nullable  | Soft delete. Null means the user is live    |

### PostgreSQL — `profile` table

One per user, created in the same transaction as the user.

| Column            | Type                   | Description                               |
| ----------------- | ---------------------- | ----------------------------------------- |
| `id`              | serial PK              | Auto-increment                            |
| `userId`          | int UNIQUE, FK         | References `user.id`, `ON DELETE CASCADE` |
| `firstName`       | varchar(100), nullable |                                           |
| `lastName`        | varchar(100), nullable |                                           |
| `bio`             | text, nullable         |                                           |
| `profileImageUrl` | varchar, nullable      | A URL                                     |
| `isDude`          | boolean                | Dudeist flag. Defaults to `false`         |
| `ordainedDate`    | timestamptz, nullable  | An instant in UTC                         |
| `createdAt`       | timestamptz            | Set by the database                       |
| `updatedAt`       | timestamptz            | Moved by TypeORM on every update          |
| `deletedAt`       | timestamptz, nullable  | Set and cleared together with its user's  |

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

Every route needs a token unless it is marked public. A token comes from
`POST /auth`.

Every list route takes `?limit=` (1 to 100, default 10) and `?page=` (from 1,
default 1). It answers with `data`, `meta` and `links`, where `links.next` is
the next page or `null`. [src/shared/dto/README.md](../src/shared/dto/README.md)
shows the full shape.

### Auth

| Method | Endpoint | Access | Description                |
| ------ | -------- | ------ | -------------------------- |
| POST   | `/auth`  | Public | Log in and get a JWT token |

### Users (PostgreSQL)

| Method | Endpoint             | Access | Description                             |
| ------ | -------------------- | ------ | --------------------------------------- |
| POST   | `/users`             | Public | Sign up. Creates the user and a profile |
| GET    | `/users`             | Admin  | List users, paginated, in id order      |
| GET    | `/users/me`          | Token  | The caller's own user                   |
| GET    | `/users/:id`         | Public | One user                                |
| PATCH  | `/users/me`          | Token  | Update the caller's own user            |
| PATCH  | `/users/:id`         | Admin  | Update any user                         |
| DELETE | `/users/me`          | Token  | Soft-delete the caller's own account    |
| DELETE | `/users/:id`         | Admin  | Soft-delete any user                    |
| POST   | `/users/:id/restore` | Admin  | Restore a soft-deleted user             |

### Profiles (PostgreSQL)

| Method | Endpoint             | Access         | Description                 |
| ------ | -------------------- | -------------- | --------------------------- |
| GET    | `/profiles`          | Public         | List profiles, paginated    |
| GET    | `/profiles/me`       | Token          | The caller's own profile    |
| GET    | `/profiles/user/:id` | Public         | The profile of one user     |
| GET    | `/profiles/:id`      | Public         | One profile                 |
| PATCH  | `/profiles/me`       | Token          | Update the caller's profile |
| PATCH  | `/profiles/:id`      | Owner or admin | Update a profile            |

### Abidings (MongoDB)

| Method | Endpoint              | Access          | Description                                        |
| ------ | --------------------- | --------------- | -------------------------------------------------- |
| GET    | `/abidings`           | Public          | List abidings, paginated, newest first             |
| GET    | `/abidings?userId=X`  | Public          | Filter by author                                   |
| GET    | `/abidings?hashtag=X` | Public          | Filter by tag. Several, comma-separated, match any |
| GET    | `/abidings/me`        | Token           | The caller's own abidings, paginated, newest first |
| GET    | `/abidings/:id`       | Public          | One abiding                                        |
| POST   | `/abidings`           | Token           | Post an abiding, or a reply with `replyToId`       |
| PATCH  | `/abidings/:id`       | Author or admin | Edit an abiding                                    |
| DELETE | `/abidings/:id`       | Author or admin | Delete an abiding                                  |

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
- [x] JWT auth: sign up with `POST /users`, log in with `POST /auth`
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
