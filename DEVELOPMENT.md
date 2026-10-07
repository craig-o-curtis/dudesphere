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

Copy `.env.example` to `.env` and fill in your values:

| Variable        | Description            | Example         |
| --------------- | ---------------------- | --------------- |
| `PG_ADMIN_USER` | PostgreSQL role name   | `admin`         |
| `PG_ADMIN_PW`   | PostgreSQL password    | (your password) |
| `PG_DATABASE`   | Database name          | `dude`          |
| `MG_ADMIN_USER` | MongoDB admin user     | `dude`          |
| `MG_ADMIN_PW`   | MongoDB admin password | (your password) |

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

## Seeds and Backfills

### Seed data

```bash
pnpm seed:run
```

Creates the admin user and profile from `EMAIL` and `PASSWORD` in `.env`, and
some sample abidings. The abidings seed only runs when `NODE_ENV` is
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
every run and leaves each one deleted. Nothing in the app brings a deleted tag
back, including posting with it again.

It walks the whole collection with a cursor, so it does not load every abiding
into memory, but it does write to every abiding. On a large collection, expect
it to take a while.

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
