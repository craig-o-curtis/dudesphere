# Fullstack architecture

## Description

Dudesphere is one pnpm workspace with two apps. The NestJS API lives in
`apps/api`. The Next.js web app lives in `apps/web`. Shared code lives in
`packages/*`. One clone, one `pnpm install`, one set of shared types.

This file covers the workspace layout, the scripts, and how the pieces connect.
The web app itself is in [frontend-architecture.md](./frontend-architecture.md).
The backend is in [overview.md](./overview.md). The work is tracked in
[epic-lebowski/tracker.md](./epic-lebowski/tracker.md).

## Layout

```text
dudesphere/
  apps/
    api/                  @dudesphere/api: the NestJS app, its tests, vitest configs, .env files, Dockerfile
    web/                  @dudesphere/web: Next.js 16.4, React 19.3
  packages/
    config/               @dudesphere/config: tsconfig.base.json
    api-types/            @dudesphere/api-types: hand-written response types
    lane-engine/          @dudesphere/lane-engine: bowling scoring and the pin model
  context/                these docs, and the epic in context/epic-lebowski/
  .agents/                skills
  .githooks/              pre-commit and commit-msg
  .github/workflows/      ci.yml
  docker-compose.yml      Postgres, Mongo, pgAdmin, Mailpit
  pnpm-workspace.yaml     packages: apps/*, packages/*
  package.json            root scripts and shared dev tools only
  .oxlintrc.json          the shared lint base
  .oxfmtrc.json           the one format config
  AGENTS.md
```

The root `package.json` holds no app code. It holds the workspace scripts and
the tools every package shares: `oxlint`, `oxlint-tsgolint`,
`@northguild/gmt-oxlint`, `oxfmt`, `tsx` and `typescript`.

## Status on 2026-10-14

All of this is on the `chore/fullstack-setup` branch.

| Piece                  | Story   | Status                                                                                     |
| ---------------------- | ------- | ------------------------------------------------------------------------------------------ |
| `apps/api`             | REPO-1  | Done. The Nest app moved in commit `a42c4e3`. Tests, e2e and migrations run from there     |
| Root scripts and hooks | REPO-1  | Done                                                                                       |
| `packages/config`      | REPO-2  | Done in commit `22360af`. `apps/api/tsconfig.json` extends the base                        |
| `packages/api-types`   | REPO-3  | Done in commit `65bc051`, with the drift check                                             |
| CI per app             | REPO-4  | Done. The API jobs run with `pnpm --filter`, and the `web` job came with the scaffold      |
| `packages/lane-engine` | LANE-21 | Skeleton done in commit `db1f9bf`. The USBC test vectors wait as pending tests for LANE-21 |
| `apps/web`             | WEB-5   | Scaffold done in commit `5acc663`. One placeholder page; no real page is built yet         |

## Root scripts

Every pnpm script runs with its package's folder as the working directory. So
`apps/api` scripts find `apps/api/.env` without any path change.

| Script                | Runs                                                                               |
| --------------------- | ---------------------------------------------------------------------------------- |
| `pnpm dev`            | builds the packages, then every app's `dev` in parallel                            |
| `pnpm dev:api`        | builds the API's workspace dependencies, then `nest start --env-file .env --watch` |
| `pnpm dev:web`        | builds the web app's workspace dependencies, then `next dev -p 3001`               |
| `pnpm build`          | every package's `build`                                                            |
| `pnpm build:packages` | `build` in `packages/*` only                                                       |
| `pnpm typecheck`      | builds the packages, then every package's `typecheck`                              |
| `pnpm test`           | builds the packages, then every package's unit tests                               |
| `pnpm test:e2e`       | the API's e2e suite against live databases                                         |
| `pnpm lint`           | `oxlint --type-aware` across the workspace                                         |
| `pnpm format`         | `oxfmt .`                                                                          |
| `pnpm format:check`   | `oxfmt --check .`, as CI runs it                                                   |
| `pnpm db:up`          | `docker compose --env-file apps/api/.env up -d`                                    |
| `pnpm db:down`        | `docker compose --env-file apps/api/.env down`                                     |

Any other app script runs through a filter, such as
`pnpm --filter @dudesphere/api migration:run` or
`pnpm --filter @dudesphere/web build`.

`pnpm db:up` matters. A bare `docker compose up -d` cannot fill in the
`${PG_ADMIN_USER}` style values, because the `.env` file is no longer at the
root, and Postgres starts with blank credentials.

## Ports

| App               | Port | Set by                                      |
| ----------------- | ---- | ------------------------------------------- |
| `@dudesphere/api` | 3000 | the default in `src/config/env.validate.ts` |
| `@dudesphere/web` | 3001 | `next dev -p 3001` and `next start -p 3001` |
| Mailpit web UI    | 8025 | `docker-compose.yml`                        |

## Env files

| File                                               | Holds                                                   |
| -------------------------------------------------- | ------------------------------------------------------- |
| `apps/api/.env`, `.env.staging`, `.env.production` | the API's secrets and database logins. Git ignores them |
| `apps/api/.env.example`                            | every API key with a safe example value                 |
| `apps/web/.env.local`                              | the web app's values. Git ignores it                    |
| `apps/web/.env.example`                            | `API_URL=http://localhost:3000`                         |

`API_URL` is server-only. It has no `NEXT_PUBLIC_` prefix, so Next never puts
it in a browser bundle, and only `lib/api.ts` reads it. `lib/api.ts` imports
`server-only`, so a client component that imports it fails the build.

`FRONTEND_URL` in `apps/api/.env` points at the web origin,
`http://localhost:3001` locally. Nest builds password reset links from it.

API-10 adds `BFF_SECRET` to both apps. WEB-45 adds
`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` for the Vercel deploy.

The `pre-commit` and `commit-msg` hooks run
`apps/api/src/dev/check-env-leaks.ts`. It reads every env file above and
refuses a commit whose staged files or message hold a real value from one.

## Shared types and the drift check

`packages/api-types` exports TypeScript types only, from a hand-written
`index.d.ts`. No runtime code, no decorators. Its `package.json` has `types`
and `exports.types` and nothing else.

| Type                       | Source in `apps/api`                           |
| -------------------------- | ---------------------------------------------- |
| `Paginated<T>`             | `src/shared/pagination/paginated.interface.ts` |
| `UserRole`                 | the role enum on `src/users/user.entity.ts`    |
| `UserResponse`             | `src/users/dto/user-response.dto.ts`           |
| `ProfileResponse`          | `src/profiles/dto/profile-response.dto.ts`     |
| `AbidingResponse`          | `src/abidings/dto/abiding-response.dto.ts`     |
| `HashtagResponse`          | `src/hashtags/dto/hashtag-response.dto.ts`     |
| `ApiErrorCode`, `ApiError` | the error body every refusal carries           |
| `TokenPair`                | the answer of `POST /auth/token` and refresh   |

There is no `JwtClaims` type. The browser never sees the JWT, so the web app has
no use for one.

The DTO classes stay in `apps/api`. They carry `class-validator` and
`class-transformer` decorators, and those do not belong in a browser bundle.

The file is `.d.ts` rather than `.ts` because a `.ts` source outside
`apps/api` would break the API's `rootDir: "."`.

**The drift check.** `apps/api/src/shared/api-types.contract.ts` compares each
DTO with its shared type at the type level, through a `Matches<A, B>` helper. It
needs `A extends B`, `B extends A`, and the same field names on both sides. The
names matter: a renamed optional field passes the first two tests on its own.
`UserResponseDto` is compared without `password` and `deletedAt`. Enums are
compared through `` `${Enum}` ``. The file has no runtime code. A change to a DTO
that the shared type does not match fails `pnpm typecheck` and `nest build`.

**How to add a shared type.** When the API gains a response the web app reads:

1. Write the response DTO in `apps/api` as usual.
2. Add the matching type to `packages/api-types/index.d.ts`, with a one-line
   comment naming the route that answers with it. Use plain types: string
   unions, not enums, and ISO strings for every timestamp.
3. Add one line to `apps/api/src/shared/api-types.contract.ts`:
   `export type XMatches = Expect<Matches<XResponseDto, XResponse>>;`. For an
   enum or a union of strings, use `Same` with `` `${Enum}` `` instead.
4. Run `pnpm typecheck`. Then rename one field on either side, check that the
   typecheck fails, and put it back.
5. Add a row to the table above.

Generating the types from the classes stays deferred. The drift check makes the
hand-written copy safe enough.

## `packages/lane-engine`

A built ESM package: `dist/` with `.d.ts` files beside the JavaScript. It is
built, not read from source, because Nest runs compiled JavaScript with no
bundler and `pnpm deploy` needs real files.

- `exports` points at `dist`.
- Scripts: `build`, `dev` (a `tsc` watch), `typecheck`, `test` (Vitest with
  `root: import.meta.dirname`).
- Both apps depend on it with `"@dudesphere/lane-engine": "workspace:*"`. No
  tsconfig `paths`.
- `build:packages` runs before `dev`, `test` and `typecheck` at the root and in
  CI. The web app also lists it in `transpilePackages`.

The engine scores games, validates rolls and runs the seeded pin model. Nest
uses it to compute each roll. Next uses it to animate the roll before Nest
answers. LANE-21 and API-23 hold its spec.

## `packages/config`

`tsconfig.base.json` holds only the options both apps share: `strict`,
`skipLibCheck`, `isolatedModules`, `esModuleInterop`,
`allowSyntheticDefaultImports` and `resolvePackageJsonExports`. Each app's
`tsconfig.json` extends it by relative path, such as
`../../packages/config/tsconfig.base.json`. Nothing needs installing.

The lint config does not live here. `.oxlintrc.json` cannot extend a package
name, only a file path.

## Lint and format

**Format.** One root `.oxfmtrc.json` covers the whole workspace.

**Lint.** The root `.oxlintrc.json` is the shared base. It loads the
`@northguild/gmt-oxlint` plugin through `jsPlugins`, extends the plugin's
recommended config, and ignores `dist`, `.next` and `coverage` folders.

Each app has its own `.oxlintrc.json` that extends the root one:

- `apps/api/.oxlintrc.json` turns off the two zero-`Date` rules for entity,
  schema and `src/shared/` files, where TypeORM and Mongoose need a `Date`.
- `apps/web/.oxlintrc.json` adds the `react`, `jsx-a11y` and `nextjs` plugins and
  the browser environment, and ignores `.next/**` and `next-env.d.ts`.

The base stays at the root because oxlint resolves `jsPlugins` and `extends`
from the file that declares them. So `@northguild/gmt-oxlint` stays a root
devDependency, and every app inherits the zero-`Date` rules.

`oxlint --type-aware` runs once from the root. Its type-aware rules build one
program per nearest `tsconfig.json`, so one run covers both apps.

## CI

`.github/workflows/ci.yml` has four jobs. Each one runs on every pull request to
`main` and every push to `main`. No job has a `paths:` filter, because a filter
would leave a required check unreported.

| Job          | Runs                                                                                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `checks`     | `format:check`, `lint`, then the API's workspace packages build, then the API's `typecheck`, `test` and `build`                                                                             |
| `migrations` | applies every migration to an empty Postgres, checks the entities match, rolls the newest back and re-applies it                                                                            |
| `e2e`        | creates the schema, seeds the admin, and runs `pnpm --filter @dudesphere/api test:e2e` against live Postgres and Mongo                                                                      |
| `web`        | no databases. Restores `apps/web/.next/cache`, builds the web app's workspace packages, runs `typecheck` (`next typegen && tsc --noEmit`) and `next build` with `NEXT_TELEMETRY_DISABLED=1` |

The `web` job has no API to call. With Cache Components on, a page that reads
the API outside `<Suspense>` fails `next build`, so this job catches it.

## Docker

`docker-compose.yml` runs Postgres, Mongo, pgAdmin and Mailpit. Both apps run
on the host, with hot reload. Start the containers with `pnpm db:up`.

`apps/api/Dockerfile` builds the API image from the repo root, which is the
build context:

1. Copy the root manifests and each package's `package.json`.
2. `pnpm install --frozen-lockfile --ignore-scripts --filter "@dudesphere/api..."`.
3. Copy the rest, then `pnpm --filter "@dudesphere/api..." run build`.
4. `pnpm --filter @dudesphere/api deploy --legacy --prod /out` copies the API,
   its production dependencies and the built workspace packages into one folder.
5. A `node:26-alpine` stage runs `node dist/main.js` from that folder.

A root `.dockerignore` keeps `node_modules`, `.env` files and build output out
of the context.

The web app has no Dockerfile. It deploys to Vercel (WEB-45). The API image
deploys to Railway or Fly, with Neon for Postgres.

## No CORS

The browser never calls the API. Next Server Components, Server Actions and
Route Handlers in `apps/web` call `API_URL` server to server. So `enableCors`
stays off in `apps/api/src/app-setup.ts`, and the JWT never reaches page
scripts.

Cost accepted: every API call from the browser makes one extra hop through
`apps/web`. For this app that is fine. If a feature later needs the browser to
talk to Nest directly, such as the live lane rooms in LANE-49, turn CORS on for
the web origin only, and say why in `overview.md`.

## What does not change

- Docker Compose still runs only the databases and their tools. Both apps run
  locally.
- The e2e cleanup job in `apps/api/test/global-setup.ts` and the `e2e-` prefix
  rule stay as they are.
- The zero-`Date` policy and `@northguild/gmt` apply to `apps/web` and every
  package as well. Timestamps cross the API as ISO 8601 UTC strings and stay
  strings in the browser until a formatter needs them.
- Postgres changes still go through migrations in
  `apps/api/src/database/migrations/`. They are append-only from the first Neon
  run.
- Nest owns both databases. The web app never writes a database row, and the
  workspace keeps to TypeORM and Mongoose.
