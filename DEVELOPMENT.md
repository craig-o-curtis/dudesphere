# Development Guide

## Prerequisites

- [Node.js](https://nodejs.org/) (v24 recommended, v22 or v20 acceptable)
- [pnpm](https://pnpm.io/installation)
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
