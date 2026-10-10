# Development Guide

## Prerequisites

- [Node.js](https://nodejs.org/) v26 — the version in `.node-version`. With fnm, run `fnm use` in the repo root.
- [pnpm](https://pnpm.io/installation) 12 — Node 26 dropped corepack, so install pnpm yourself: `npm i -g pnpm@12.8.1`
- [Docker](https://www.docker.com/) (for databases)

## Setup

### 1. Environment Variables

```bash
cp .env.example .env
# Edit .env with your credentials (see below)
```

### 2. Start Databases

```bash
docker compose up -d
```

This starts:

- **PostgreSQL 18** on port 5432
- **MongoDB 8** on port 27017
- **pgAdmin** on http://localhost:5050
- **Mongo Express** on http://localhost:8081

### 3. Start NestJS App

```bash
pnpm run start:dev
```

The app runs on `http://localhost:3000` (or the port specified in `.env`).

## Environment Variables

Copy `.env.example` to `.env` and fill in your values.

The app checks every variable when it starts, in `src/config/env.validate.ts`. It refuses to start if a required one is missing or a value is malformed, and the error names each bad variable. An empty value counts as not set.

| Variable                  | Required | Description                                                             | Example or default                                |
| ------------------------- | -------- | ----------------------------------------------------------------------- | ------------------------------------------------- |
| `NODE_ENV`                | no       | `development`, `staging`, `production` or `test`                        | default `development`                             |
| `PORT`                    | no       | Port the app listens on                                                 | default `3000`                                    |
| `PG_HOST`                 | yes      | PostgreSQL host                                                         | `localhost`                                       |
| `PG_PORT`                 | yes      | PostgreSQL port                                                         | `5432`                                            |
| `PG_ADMIN_USER`           | yes      | PostgreSQL role name                                                    | `admin`                                           |
| `PG_ADMIN_PW`             | yes      | PostgreSQL password                                                     | (your password)                                   |
| `PG_DATABASE`             | yes      | Database name                                                           | `dude`                                            |
| `MONGO_URI`               | no       | MongoDB connection string                                               | default `mongodb://localhost:27017/dude-abidings` |
| `JWT_SECRET`              | yes      | Key that signs login tokens                                             | (a long random string)                            |
| `JWT_EXPIRES_IN`          | no       | How long a login token lasts, in seconds                                | default `3600`                                    |
| `JWT_AUDIENCE`            | no       | Who a token is for. Written into each token and checked on each request | default `dudesphere-api`                          |
| `JWT_ISSUER`              | no       | Who issued a token. Written and checked the same way                    | default `dudesphere`                              |
| `DUDE_OBSERVE_APP_KEY`    | yes      | Observe project key                                                     | (from the Observe dashboard)                      |
| `DUDE_OBSERVE_APP_SECRET` | yes      | Observe project secret                                                  | (from the Observe dashboard)                      |
| `EMAIL`                   | seed     | Login of the seeded admin. Needed by `pnpm seed:run` and the e2e tests  | `admin@dude.com`                                  |
| `PASSWORD`                | seed     | Password of the seeded admin                                            | (your password)                                   |
| `MG_ADMIN_USER`           | compose  | MongoDB admin user. Read by `docker-compose.yml`, not by the app        | `dude`                                            |
| `MG_ADMIN_PW`             | compose  | MongoDB admin password. Read by `docker-compose.yml`                    | (your password)                                   |

## pgAdmin Setup

pgAdmin doesn't auto-discover PostgreSQL. Add it manually:

1. Open http://localhost:5050
2. Right-click **Servers** → **Register** → **Server**
3. Fill in:
   - **Name**: `dude-postgres`
   - **Host name/address**: `postgres`
   - **Port**: `5432`
   - **Maintenance database**: `dude`
   - **Username**: (from `PG_ADMIN_USER`)
   - **Password**: (from `PG_ADMIN_PW`)

## Mongo Express Setup

Open http://localhost:8081 and log in with your MongoDB credentials from `.env`.

## Mongo Schema Changes

Postgres and MongoDB change in different ways, and only Postgres has migrations.

- **Postgres** holds `user` and `profile`. Their schema only changes through a
  migration. See "Database Migrations" in the [README](README.md).
- **MongoDB** holds `abidings` and `hashtags`. There is nothing to migrate.
  Adding a `@Prop` to a schema changes what the app writes from then on. It
  does nothing to documents already stored.

`pnpm migration:check` will never notice a Mongo change. It reads
`src/database/data-source.ts`, which only loads `*.entity.ts` files, and those
are the two Postgres tables. That is correct, not a gap.

So when you add a field to a Mongoose schema, the question is whether the
documents already stored need it filled in.

### When a new field needs no backfill

A new field that can be null usually needs nothing, as long as every read
treats "missing" and "null" the same way. MongoDB does this for you: a filter
of `{ deletedAt: null }` matches a document where `deletedAt` is null and also
one that has no `deletedAt` at all.

`Hashtag.deletedAt` and `Abiding.deletedAt` both work this way. Every read
filters on `deletedAt: null`, so documents written before the field existed
count as live from the first day, with no write to any of them.

### When it does need one

Write a backfill when any of these is true:

- A read filters the other way, such as `{ deletedAt: { $ne: null } }`, where
  a missing field and a null one do not match the same documents.
- You sort on the field or build an index on it.
- The value has to be worked out from other data. `Abiding.hashtags` was this
  kind: it is derived from `message`, and no query can infer it. That is why
  `pnpm backfill:hashtags` exists.

To write one, follow `src/database/seeds/hashtag-backfill.seed.ts`: a service
that is safe to run twice, a thin runner like `backfill-hashtags.ts`, a script
in `package.json`, and a spec.

### When you remove a field

Take it out of the schema, and out of anything that wrote it. Documents that
still hold a value do no harm: Mongoose ignores a stored field the schema
does not name, so it never reaches the app.

To clear the stored values as well, unset the field once, in `mongosh` or
Mongo Express:

```js
db.abidings.updateMany({}, { $unset: { username: "" } });
```

`Abiding.username` was removed this way. It was a copy of the author's name
that only the seed ever wrote, and every response already read the current
name from Postgres.

### When you change an index

Indexes are declared at the bottom of each schema file with
`Schema.index(...)`. Mongoose builds any that are missing when the app starts.
It never drops one. So after you change an index, the new one appears on the
next start and the old one stays behind. An unused index does no harm to a
read, but every write still updates it.

List what is there:

```js
db.abidings.getIndexes();
```

Drop one by name:

```js
db.abidings.dropIndex("createdAt_-1");
```

The list routes sort by `{ createdAt: -1, _id: -1 }`, and four indexes were
changed to end with those two keys. These are the four they replaced. Drop
them once, in `mongosh` or Mongo Express, in any database that had them:

```js
db.abidings.dropIndex("createdAt_-1");
db.abidings.dropIndex("userId_1_createdAt_-1");
db.abidings.dropIndex("hashtags_1_createdAt_-1");
db.abidings.dropIndex("userId_1_hashtags_1");
```

To check that a query reads from an index, ask Mongo for its plan. A `SORT`
stage in the answer means it sorted in memory and the index did not help:

```js
db.abidings
  .find({ deletedAt: null, userId: 1 })
  .sort({ createdAt: -1, _id: -1 })
  .limit(10)
  .explain("executionStats");
```

A filter on several tags reads one sorted run of the index for each tag and
merges them. That shows as `SORT_MERGE`, which is fine: it is not a sort in
memory.

```js
db.abidings
  .find({ deletedAt: null, hashtags: { $in: ["dude", "sunday"] } })
  .sort({ createdAt: -1, _id: -1 })
  .limit(10)
  .explain("executionStats");
```

Mongo 8 merges up to 200 tags this way. At 201 the plan changes to a plain
`SORT`. `GET /abidings` takes at most 10 tags, so no request gets there.

A count is different. `countDocuments({ deletedAt: null })` reads every
document, because no index holds `deletedAt`, and Mongo cannot answer a
`null` match from an index alone. Every list request runs one for
`meta.totalItems`. The comment on `findPage` in
`src/abidings/abidings.service.ts` says why that is accepted.

## Seeds and Backfills

### Seed data

```bash
pnpm seed:run
```

Creates the admin user and profile from `EMAIL` and `PASSWORD` in `.env`, and
some sample abidings. The password is stored as a bcrypt hash. Running the seed
again resets the admin's password to the value in `.env`. The abidings seed only runs when `NODE_ENV` is
`development`, and skips itself if the collection already has documents.

### Hashtag backfill

```bash
pnpm backfill:hashtags
```

Re-reads every abiding's `message`, rewrites its `hashtags` array, and adds
every tag it finds to the `hashtags` collection.

Run it when any of these is true:

- **You have abidings that predate hashtags.** They have no `hashtags` field,
  so nothing finds them by tag and their tags are missing from the dropdown.
  This is the one-time case, and it is already done on existing environments.
- **You changed the tag rules** in `src/shared/utils/hashtag.ts` — the
  character set, the 64-character limit, the 10-tag cap, the normalizing. Old
  abidings keep the tags derived under the old rules until you re-run this.
- **`GET /hashtags` is missing a tag** that abidings clearly use. A tag is
  registered by a second write that is not in a transaction with the abiding,
  so a failure there can leave a tag used but unregistered. This repairs it.
- **You restored or imported abidings** by writing to Mongo directly, rather
  than through `POST /abidings`.

You do not need it after ordinary posting or editing. Both derive tags and
register them as they go.

Safe to run as many times as you like: it derives everything from `message`
rather than checking what is already stored, and tag registration only inserts
tags that are missing. Running it twice produces the same result as running it
once.

It does not bring back a hashtag an admin has deleted. Abidings keep a deleted
tag in their own `hashtags` array, so the backfill sees every deleted tag on
every run and leaves each one deleted. Posting with a deleted tag does not
bring it back either. Only an admin can, with `POST /hashtags/:slug/restore`.

It walks the whole collection with a cursor, so it does not load every abiding
into memory, but it does write to every abiding. On a large collection, expect
it to take a while.

## End-to-End Tests

```bash
pnpm test:e2e                              # every suite
pnpm test:e2e test/hashtags.e2e-spec.ts    # one suite
```

The suites live in `test/*.e2e-spec.ts`. They run against the databases named
in `.env`, which are your dev databases. There is no separate test database.

Two things are set for you:

- **The suites refuse to start unless both databases are on this machine.**
  They write rows and then hard-delete them, so `test/global-setup.ts` checks
  `PG_HOST` and `MONGO_URI` first and stops the run if either names another
  host. The check is in `test/local-databases.ts`.
- **The suites run in the `Asia/Tokyo` time zone.** `vitest.config.e2e.ts`
  sets it. CI machines run in UTC, where a timestamp read in "the machine's
  zone" happens to be right, so a time zone bug cannot show there.

Before the first run:

```bash
docker compose up -d
pnpm migration:run
pnpm seed:run
```

The seed matters. `authorization.e2e-spec.ts` and `profile-me.e2e-spec.ts` log
in as the seeded admin, with `EMAIL` and `PASSWORD` from `.env`.

### How the cleanup works

`test/global-setup.ts` deletes what the suites wrote. `vitest.config.e2e.ts`
registers it as `globalSetup`, so vitest runs it once before the first suite
and once after the last one. Both runs do the same cleanup. A run that was
killed halfway is cleaned up by the start of the next one.

It finds e2e data by its shape, in this order:

1. **Users.** It reads the ids of every `user` row whose email matches
   `e2e-%@example.com`.
2. **Abidings (Mongo).** It deletes every abiding whose `userId` is one of
   those ids.
3. **Hashtags (Mongo).** It deletes every hashtag whose slug is `e2e` followed
   by exactly 12 hex characters, such as `e2e3f7af56bef13`.
4. **Profiles, then users (Postgres).** It deletes the `profile` rows for those
   ids, then the `user` rows.

These are real deletes, not soft deletes. The seeded admin and your own dev
data match none of the shapes, so the cleanup leaves them alone.

Mongo goes before Postgres on purpose. An abiding holds nothing that marks it
as e2e data except its `userId`, and the `user` row is the only place that id
can be read from. If the Mongo step fails, the users are still there, so the
next run finds the same abidings and tries again.

Each cleanup prints one line:

```text
[e2e before] removed 0 users, 0 profiles, 0 abidings, 0 hashtags
[e2e after] removed 6 users, 6 profiles, 4 abidings, 1 hashtags
```

A `before` line with numbers above zero means the last run did not finish. That
is fine: this run has now cleaned up after it.

### Rules for a new suite

The cleanup can only delete what it can recognise. A suite that breaks one of
these rules leaves rows behind on every run.

- **Give every user an `e2e-` email at `example.com` and an `e2e-` username.**
  Copy `registerAndLogin` in `authorization.e2e-spec.ts`.
- **Post abidings as a user you registered.** `POST /abidings` takes the author
  from the token and answers 404 when that user is deleted or does not exist.
  So a forged token can only post when its `sub` is the id of a real user, and
  that user must be an e2e one. This check is what keeps every abiding tied to
  a `user` row the cleanup can find.
- **Build hashtags as `e2e` plus 12 hex characters.** Copy `unusedSlug` in
  `hashtags.e2e-spec.ts`. A slug cannot hold a hyphen, so there is no `e2e-`
  prefix to match on. The cleanup matches the whole shape so that it cannot
  delete a real tag such as `#e2etesting`.
- **If a suite writes to a new table or collection, add it to
  `test/global-setup.ts`** in the same change.

### Tips

- **`pnpm start:dev` can stay running.** Each suite starts its own copy of the
  app on a free port.
- **Start each suite the way the others do.** Call `configureApp(app)`, then
  `listenOnLoopback(app)` in place of `app.init()`. The first gives the suite
  the same pipes, filters and interceptors as `main.ts`. The second stops a
  request from reaching another program on your machine. The comment in
  `test/listen-on-loopback.ts` explains how.
- **Suites run in parallel, against one database.** Make every name random, and
  never assert on a count that another suite or your own dev data could change,
  such as `meta.totalItems` on `GET /abidings`. A count is safe once the list
  is filtered by something only your suite made, such as its own user id. Use
  `randomUUID()`: the lint rules ban `Date.now()`.
- **A list comes back one page at a time.** The row you are looking for may
  not be on page 1 of the dev database. To check that a row is on a list, or
  is not, follow `links.next` to the end, as `listEverySlug` does in
  `test/hashtags.e2e-spec.ts`.
- **Do not delete e2e users by hand.** Once the `user` row is gone, nothing
  links its abidings to the e2e run, and no later run removes them. If that
  happens, delete the stranded abidings in Mongo Express.
- **Guards can only be tested here.** `JwtAuthGuard` and `RolesGuard` are
  registered in `AppModule`, and a unit controller spec never loads them. A
  401 or 403 test belongs in an e2e suite.
- **CI runs the same suites** against empty databases that it throws away. See
  "Continuous Integration" in the [README](README.md).

## Troubleshooting

### "role does not exist" error

The PostgreSQL volume may contain stale data from a previous setup. Fix:

```bash
docker compose down -v --remove-orphans
docker compose up -d
pnpm run start:dev
```

### Tables not appearing in pgAdmin

Tables are created by migrations, not by starting the app. `synchronize` is turned off. Run `pnpm migration:run`, then refresh pgAdmin.

## Useful Commands

```bash
# View logs
docker compose logs -f dude-postgres
docker compose logs -f dude-mongo

# Check status
docker compose ps

# Stop everything
docker compose down

# Stop + remove volumes (⚠️ deletes all data)
docker compose down -v
```
