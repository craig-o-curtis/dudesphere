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

Tables are created automatically by TypeORM when the NestJS app starts (via `synchronize: true`). Start the app first, then refresh pgAdmin.

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
