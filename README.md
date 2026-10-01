# DudeSphere

NestJS demo application with PostgreSQL (TypeORM) and MongoDB (Mongoose).

## Tech Stack

- **NestJS 12** — Backend framework
- **PostgreSQL 18** — User data (TypeORM)
- **MongoDB 8** — Abiding data (Mongoose)
- **@northguild/gmt** — GMT-only date handling (ISO strings, zero JS Date usage)

## Prerequisites

- [Node.js](https://nodejs.org/) (LTS version)
- [pnpm](https://pnpm.io/installation)
- [Docker](https://www.docker.com/) (for databases)

## Project Setup

```bash
# Install dependencies
pnpm install
```

## Environment Variables

Copy the example environment file and adjust as needed:

```bash
cp .env.example .env
```

## Running the Application

```bash
# Development mode (with hot reload)
pnpm run start:dev

# Production mode
pnpm run start:prod
```

## Database Setup with Docker Compose

Start PostgreSQL, MongoDB, and pgAdmin:

```bash
# Start all database services in the background
docker compose up -d

# Check service status
docker compose ps

# View logs
docker compose logs -f

# Stop all services
docker compose down

# Stop and remove volumes (⚠️ deletes all data)
docker compose down -v
```

### Database Services

| Service       | Port  | URL                   | Description              |
| ------------- | ----- | --------------------- | ------------------------ |
| PostgreSQL    | 5432  | —                     | User data (TypeORM)      |
| MongoDB       | 27017 | —                     | Abiding data (Mongoose)  |
| pgAdmin       | 5050  | http://localhost:5050 | PostgreSQL management UI |
| Mongo Express | 8081  | http://localhost:8081 | MongoDB management UI    |

### Database Credentials

Credentials are configured in `.env`:

- **PostgreSQL**: `dude` / `dude_password_123`
- **MongoDB**: `dude` / `dude_mongo_123`

## Development Commands

```bash
# Lint code (oxlint with GMT plugin)
pnpm run lint

# Run unit tests
pnpm run test

# Run e2e tests
pnpm run test:e2e

# Run test coverage
pnpm run test:cov

# Build the project
pnpm run build
```

## Database Migrations

The PostgreSQL schema is managed by migrations in `src/database/migrations/`. `synchronize` is turned off, so the app never changes tables on its own.

```bash
# Apply any migrations that haven't run yet (run this after pulling)
pnpm run migration:run

# Check whether your entities and the database disagree.
# Exits 0 with "No changes in database schema were found" if they match.
# Exits 1 if a migration is needed. Writes no files.
pnpm run migration:check

# Generate a migration from the differences (replace AddSomething with a name)
pnpm run migration:generate src/database/migrations/AddSomething

# Undo the most recent migration
pnpm run migration:revert
```

### Changing an entity

1. Edit the entity (`*.entity.ts`).
2. Run `pnpm run migration:check`. If it reports changes, continue.
3. Run `pnpm run migration:generate src/database/migrations/<DescriptiveName>`.
4. **Read the generated file before running it.** TypeORM can't tell a type change from a delete-and-recreate, so it sometimes writes `DROP COLUMN` + `ADD COLUMN`, which loses data. Replace those with `ALTER COLUMN ... TYPE ... USING ...`, in both `up()` and `down()`.
5. Run `pnpm run migration:run`, then `pnpm run migration:check` again. It should report no changes.
6. Commit the migration file together with the entity change.

Never edit a migration that has already been committed. Databases that have already run it won't run it again. Add a new migration instead.

## API Endpoints

### Users

| Method | Endpoint   | Description    |
| ------ | ---------- | -------------- |
| GET    | /users     | Get all users  |
| GET    | /users/:id | Get user by ID |
| POST   | /users     | Create a user  |
| PATCH  | /users/:id | Update a user  |
| DELETE | /users/:id | Delete a user  |

### Abidings

| Method | Endpoint     | Description       |
| ------ | ------------ | ----------------- |
| GET    | /abiding     | Get all abidings  |
| GET    | /abiding/:id | Get abiding by ID |
| POST   | /abiding     | Create a abiding  |
| PATCH  | /abiding/:id | Update a abiding  |
| DELETE | /abiding/:id | Delete a abiding  |

### Auth

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| POST   | /auth    | Login       |

## Database Usage

| Database   | What it stores           | ORM/Driver | Module         |
| ---------- | ------------------------ | ---------- | -------------- |
| PostgreSQL | Users (accounts)         | TypeORM    | `src/users/`   |
| MongoDB    | Abidings (posts/replies) | Mongoose   | `src/abiding/` |

PostgreSQL is a relational database — perfect for structured user data with relationships. MongoDB is a document database — ideal for flexible abiding records that may include nested replies.

## Running with Docker Compose (Recommended)

Run the entire application — NestJS + PostgreSQL + MongoDB — in a single Docker Compose setup. This gives you a production-like environment locally with zero config differences.

### How It Works

```
┌──────────────────────────────────────────────┐
│           Docker Network                     │
│                                              │
│  ┌───────────┐    postgres:5432   ┌─────────┐│
│  │  dude-app │ ─────────────────→ │postgres ││
│  │ (NestJS)  │                    │         ││
│  └───────────┘                    └─────────┘│
│       │                                   │  │
│       │    mongo:27017                    │  │
│       └─────────────────────────────────→ │mongo│
│                                           └─┼───┘
│  ┌──────────┐                               │
│  │ pgadmin  │ ──────────────────────────────┘
│  │ :5050    │                               │
│  └──────────┘                               │
└─────────────────────────────────────────────┘
        ↓ port mapping
   localhost:3000 → dude-app:3000
```

All containers share a Docker network, so service names (`postgres`, `mongo`) resolve automatically as hostnames. No config changes between local dev and production.

### Quick Start

```bash
# Build and start everything in the background
docker compose up -d --build

# Follow the app logs (same as seeing output in your terminal)
docker compose logs -f dude

# Stop all services
docker compose down

# Stop and remove volumes (⚠️ deletes all data)
docker compose down -v
```

### Development with Hot-Reload

The Docker setup mounts your local `src/` directory into the container, so **hot-reload works exactly like local dev**:

1. Start Docker: `docker compose up -d`
2. Edit files in your editor
3. NestJS detects changes and reloads automatically
4. Refresh your browser or Thunder Client to see updates

**No rebuild needed for code changes.** Only rebuild when you add/remove npm packages:

```bash
docker compose up -d --build   # After adding packages
docker compose up -d            # Normal dev (no rebuild)
```

### Two Development Approaches

| Approach                 | Command                                                      | Hot-Reload          | DB Host             |
| ------------------------ | ------------------------------------------------------------ | ------------------- | ------------------- |
| **Docker (recommended)** | `docker compose up -d`                                       | ✅ Via volume mount | `PG_HOST=postgres`  |
| **Local NestJS**         | `pnpm run start:dev` + `docker compose up -d postgres mongo` | ✅ Instant          | `PG_HOST=localhost` |

**Docker approach:** One command, everything runs together. Best for demos and production parity.

**Local approach:** Faster iteration (no Docker overhead). Run databases in Docker, NestJS locally. Change `PG_HOST=localhost` in `.env`.

### Useful Commands

```bash
# View logs for all services
docker compose logs -f

# View logs for a specific service
docker compose logs -f dude        # NestJS app
docker compose logs -f postgres    # PostgreSQL
docker compose logs -f mongo       # MongoDB

# Check running containers
docker compose ps

# Rebuild after Dockerfile changes
docker compose up -d --build

# Enter a running container
docker compose exec dude sh
docker compose exec dude-postgres psql -U dude -d dude
```

## Architecture

- **Users** → PostgreSQL via TypeORM (`src/users/`)
- **Abidings** → MongoDB via Mongoose (`src/abiding/`)
- **Date Handling** → ISO strings only, enforced by oxlint GMT plugin
