# DudeSphere

NestJS demo application with PostgreSQL (TypeORM) and MongoDB (Mongoose).

## Layout

The repo is a pnpm workspace. Run every command below from the repo root.

| Path                   | What it holds                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| `apps/api`             | The NestJS API, `@dudesphere/api`. Its `.env` lives here                                               |
| `apps/web`             | The web app, `@dudesphere/web`, on Next.js 16.4 and React 19.3. It runs on port 3001 and calls the API |
| `packages/config`      | The shared tsconfig base                                                                               |
| `packages/api-types`   | The API's response types, for the web app. A drift check keeps them in step with the API               |
| `packages/lane-engine` | Bowling scoring                                                                                        |
| `context`              | The project overview, the coding standards and the plans                                               |
| `reference`            | Study notes on NestJS, the databases and tokens                                                        |

The root `package.json` holds the scripts for the whole workspace, such as `pnpm dev`, `pnpm lint` and `pnpm db:up`. Run any other API script with `pnpm --filter @dudesphere/api <script>`.

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
cp apps/api/.env.example apps/api/.env
```

Set `FRONTEND_URL` in `apps/api/.env` to `http://localhost:3001`, so a password reset link opens the web app's page.

The web app reads `apps/web/.env.local`. It needs one line, the address of the API:

```bash
API_URL=http://localhost:3000
```

## Running the Application

```bash
# The API and the web app together, with hot reload
pnpm dev

# The API alone, with hot reload, on http://localhost:3000
pnpm dev:api

# The web app alone, on http://localhost:3001
pnpm dev:web

# The API in production mode, after pnpm build
pnpm --filter @dudesphere/api start:prod
```

## Database Setup with Docker Compose

Start PostgreSQL, MongoDB, and pgAdmin:

```bash
# Start all database services in the background
pnpm db:up

# Check service status
docker compose --env-file apps/api/.env ps

# View logs
docker compose --env-file apps/api/.env logs -f

# Stop all services
pnpm db:down

# Stop and remove volumes (⚠️ deletes all data)
docker compose --env-file apps/api/.env down -v
```

`docker-compose.yml` sits at the repo root, but the credentials are in `apps/api/.env`. `pnpm db:up` passes that file to Compose. A plain `docker compose up -d` does not, so Postgres starts with blank credentials. Give every other `docker compose` command `--env-file apps/api/.env` too.

### Database Services

| Service       | Port  | URL                   | Description              |
| ------------- | ----- | --------------------- | ------------------------ |
| PostgreSQL    | 5432  | —                     | User data (TypeORM)      |
| MongoDB       | 27017 | —                     | Abiding data (Mongoose)  |
| pgAdmin       | 5050  | http://localhost:5050 | PostgreSQL management UI |
| Mongo Express | 8081  | http://localhost:8081 | MongoDB management UI    |

### Database Credentials

No username or password is written in this repo. Each one is set in your own
`apps/api/.env`, which git ignores:

| Service       | Username                 | Password      |
| ------------- | ------------------------ | ------------- |
| PostgreSQL    | `PG_ADMIN_USER`          | `PG_ADMIN_PW` |
| MongoDB       | `MG_ADMIN_USER`          | `MG_ADMIN_PW` |
| pgAdmin       | `EMAIL`                  | `PG_ADMIN_PW` |
| Mongo Express | `MG_ADMIN_USER`          | `MG_ADMIN_PW` |
| The app admin | `EMAIL`, set by the seed | `PASSWORD`    |

`apps/api/.env.example` lists every variable. Pick your own values, and do not reuse a
password you use anywhere else.

## Development Commands

```bash
# Lint code (oxlint with GMT plugin)
pnpm run lint

# Typecheck everything, including tests (pnpm run build skips spec files)
pnpm run typecheck

# Check formatting without changing files (pnpm run format fixes it)
pnpm run format:check

# Run unit tests
pnpm run test

# Run e2e tests
pnpm run test:e2e

# Run test coverage for the API
pnpm --filter @dudesphere/api test:cov

# Build the project
pnpm run build
```

## Database Migrations

The PostgreSQL schema is managed by migrations in `apps/api/src/database/migrations/`. `synchronize` is turned off, so the app never changes tables on its own.

Migrations cover PostgreSQL only. MongoDB has none: see "Mongo Schema Changes" in [DEVELOPMENT.md](DEVELOPMENT.md) for what to do when a Mongoose schema changes.

The migration scripts run inside `apps/api`, so a path you pass them is relative to `apps/api`.

```bash
# Apply any migrations that haven't run yet (run this after pulling)
pnpm --filter @dudesphere/api migration:run

# Check whether your entities and the database disagree.
# Exits 0 with "No changes in database schema were found" if they match.
# Exits 1 if a migration is needed. Writes no files.
pnpm --filter @dudesphere/api migration:check

# Generate a migration from the differences (replace AddSomething with a name).
# The path is relative to apps/api.
pnpm --filter @dudesphere/api migration:generate src/database/migrations/AddSomething

# Undo the most recent migration
pnpm --filter @dudesphere/api migration:revert
```

### Changing an entity

1. Edit the entity (`*.entity.ts`).
2. Run `pnpm --filter @dudesphere/api migration:check`. If it reports changes, continue.
3. Run `pnpm --filter @dudesphere/api migration:generate src/database/migrations/<DescriptiveName>`. The path is relative to `apps/api`.
4. **Read the generated file before running it.** TypeORM can't tell a type change from a delete-and-recreate, so it sometimes writes `DROP COLUMN` + `ADD COLUMN`, which loses data. Replace those with `ALTER COLUMN ... TYPE ... USING ...`, in both `up()` and `down()`.
5. Run `pnpm --filter @dudesphere/api migration:run`, then `pnpm --filter @dudesphere/api migration:check` again. It should report no changes.
6. Commit the migration file together with the entity change.

Never edit a migration that a database you can't wipe has run. That database records each migration it ran by name and won't run it again, so an edit never reaches it and the two disagree. Add a new migration instead. From the first `migration:run` against Neon, that is every migration.

Until then, migrations can be squashed. On 2026-10-14, before any deploy, 16 migrations were folded into one, `InitialSchema`. The old files are under the git tag `pre-migration-squash`, and [reference/SCHEMA_HISTORY.md](reference/SCHEMA_HISTORY.md) keeps what they teach. To rebuild a local database from it, reset Postgres alone, then run the migration and the seed:

```bash
# Drops and recreates the Postgres database only. Mongo keeps its data.
docker compose --env-file apps/api/.env exec postgres sh -c 'dropdb -U "$POSTGRES_USER" --force "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
pnpm --filter @dudesphere/api migration:run
pnpm --filter @dudesphere/api seed:run
```

Don't use `docker compose down -v` for this: `-v` deletes every volume, Mongo's included.

## Continuous Integration

GitHub Actions runs [.github/workflows/ci.yml](.github/workflows/ci.yml) on every pull request into `main` and every push to `main`. A newer push to the same branch cancels the run that's still in progress. It has four jobs, which run in parallel. [DEVELOPMENT.md](DEVELOPMENT.md) says what each one runs.

| Job                                                    | Covers                                         |
| ------------------------------------------------------ | ---------------------------------------------- |
| **Format, lint, and the API's typecheck, test, build** | The whole repo's format and lint, then the API |
| **Web app typecheck, test, build**                     | The Next.js app, with no database              |
| **Migrations apply, match entities, and roll back**    | The API's migrations on an empty Postgres      |
| **End-to-end against live databases**                  | The API's e2e suite on Postgres and MongoDB    |

To catch failures before pushing, run the same commands locally:

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

- **Versions** are pinned in two places: `.node-version` sets the Node version, and `packageManager` in the root `package.json` sets the pnpm version. Both CI and fnm read `.node-version`, so one file covers local and CI. To upgrade either, change it there.
- **E2E tests (`test:e2e`) run in CI against real databases.** Both are service containers that start empty and are thrown away when the job ends. To run them locally you need `pnpm db:up` and `pnpm --filter @dudesphere/api migration:run` first. Locally they write to your dev databases and delete what they wrote: see "End-to-End Tests" in [DEVELOPMENT.md](DEVELOPMENT.md).
- **No secrets are needed.** The databases exist only for the length of the run, and every value the e2e job sets, including the Nest Observe keys, is a placeholder written in the workflow file.

## API Endpoints

Every list route takes `?limit=` (1 to 100, default 10) and `?page=` (from 1, default 1), and answers with `data`, `meta` and `links`. Follow `links.next` until it is `null` to read a whole list. See "How to paginate a list" in [apps/api/src/shared/pagination/README.md](apps/api/src/shared/pagination/README.md).

### Users

| Method | Endpoint   | Description                        |
| ------ | ---------- | ---------------------------------- |
| GET    | /users     | List users, paginated (admin only) |
| GET    | /users/:id | Get user by ID                     |
| POST   | /users     | Create a user (admin only)         |
| PATCH  | /users/:id | Update a user                      |
| DELETE | /users/:id | Delete a user                      |

### Abidings

| Method | Endpoint      | Description                                        |
| ------ | ------------- | -------------------------------------------------- |
| GET    | /abidings     | List abidings, paginated, newest first             |
| GET    | /abidings/me  | The caller's own abidings, paginated, newest first |
| GET    | /abidings/:id | Get abiding by ID                                  |
| POST   | /abidings     | Create an abiding                                  |
| PATCH  | /abidings/:id | Update an abiding                                  |
| DELETE | /abidings/:id | Delete an abiding                                  |

`GET /abidings` takes four optional filters, which can be combined:

- `userId` keeps one author's abidings.
- `hashtag` keeps abidings with a tag. Send up to 10, comma-separated, and an abiding needs only one of them.
- `startDate` and `endDate` keep abidings created in a range. Each is a UTC instant such as `2026-10-01T00:00:00Z`. The start is included and the end is not. A `startDate` after the `endDate` is a 400.

### Hashtags

| Method | Endpoint                | Description                                      |
| ------ | ----------------------- | ------------------------------------------------ |
| GET    | /hashtags               | List live hashtags, paginated, alphabetically    |
| GET    | /hashtags/:slug         | Get one hashtag                                  |
| DELETE | /hashtags/:slug         | Soft-delete a hashtag from the list (admin only) |
| POST   | /hashtags/:slug/restore | Restore a deleted hashtag (admin only)           |

Deleting a hashtag takes it off the list. Abidings that used it keep it, and `GET /abidings?hashtag=<slug>` still finds them. Posting with the tag again does not put it back on the list. Only an admin restoring it does, and it comes back with the casing and first-used date it had before.

### Auth

| Method | Endpoint                  | Description                          |
| ------ | ------------------------- | ------------------------------------ |
| POST   | /auth/sign-up             | Sign up                              |
| POST   | /auth/token               | Sign in with username or email       |
| POST   | /auth/token/refresh       | Swap a refresh token for a new pair  |
| POST   | /auth/token/revoke        | Sign out this device                 |
| POST   | /auth/sign-out            | Sign out this access token's sign-in |
| POST   | /auth/sign-out-everywhere | Sign out every device                |
| POST   | /auth/password/forgot     | Email a password reset link          |
| POST   | /auth/password/reset      | Set a new password with the link     |

The routes and their names follow the NestJS docs, which build auth on
`@nestjs/authentication` and `@nestjs/authorization`. [reference/TOKENS_AND_SESSIONS.md](reference/TOKENS_AND_SESSIONS.md) explains them.

Sign up with `{ "username": "...", "email": "...", "password": "...", "profile": { "displayName": "..." } }`. The username is for logging in and only you and admins see it. The display name is what other members see, on your profile and on your abidings. It must be unique, and letter case does not count.

To try a route by hand, in Thunder Client or with curl, see [Try the API by hand](DEVELOPMENT.md#try-the-api-by-hand). `pnpm --filter @dudesphere/api dev:token` prints a token for local use.

Sign in with `{ "identifier": "...", "password": "..." }`. `identifier` is your username or your email, and letter case does not matter in either. A username cannot contain `@` or spaces. The answer is `{ accessToken, refreshToken, expiresIn }`: the access token lasts 15 minutes, and the refresh token is swapped, once, for a new pair. Signing out ends the refresh token at once, and the access token on its next request. [context/overview.md](context/overview.md) has the full rules.

Forgot your password? Post `{ "email": "..." }` to `/auth/password/forgot`. In development the email lands in Mailpit at http://localhost:8025. Post `{ "token": "...", "password": "..." }`, with the token from its link, to `/auth/password/reset`.

Sign-in allows 5 tries in 15 minutes for one account from one IP address. After that it answers 429 with a `Retry-After` header. Every route, login included, also allows 100 requests a minute from one IP address.

## Database Usage

| Database   | What it stores           | ORM/Driver | Module                   |
| ---------- | ------------------------ | ---------- | ------------------------ |
| PostgreSQL | Users (accounts)         | TypeORM    | `apps/api/src/users/`    |
| MongoDB    | Abidings (posts/replies) | Mongoose   | `apps/api/src/abidings/` |

PostgreSQL is a relational database — perfect for structured user data with relationships. MongoDB is a document database — ideal for flexible abiding records that may include nested replies.

## Docker

Docker Compose runs the services the app needs, not the app. `docker-compose.yml` starts five: PostgreSQL, MongoDB, pgAdmin, Mongo Express and Mailpit. The API and the web app run on your machine, with hot reload, through `pnpm dev`. So `PG_HOST` in `apps/api/.env` stays `localhost`.

```bash
pnpm db:up     # start the five services
pnpm dev       # start the API and the web app
pnpm db:down   # stop the services
```

The API has its own image, built from `apps/api/Dockerfile`. Build it from the repo root, so the workspace files are in the build context:

```bash
docker build -f apps/api/Dockerfile -t dudesphere-api .
```

The Dockerfile builds the API and the workspace packages it uses. Then `pnpm deploy --prod` copies out the API with only its production dependencies. Compose does not use this image.

## Architecture

- **Users** → PostgreSQL via TypeORM (`apps/api/src/users/`)
- **Abidings** → MongoDB via Mongoose (`apps/api/src/abidings/`)
- **Date Handling** → ISO strings only, enforced by oxlint GMT plugin
