# Fullstack architecture

## Description

The point is to convert the original backend NestJS starter project to a
monorepo fullstack app. The NestJS API stays as it is and moves into
`apps/api`. A Nuxt frontend lands beside it in `apps/web`. One clone, one
`pnpm install`, one set of shared types.

This file covers the repo layout and the move. The frontend itself is in
[frontend-architecture.md](./frontend-architecture.md). The backend is in
[overview.md](./overview.md).

Status: planned, not built. Nothing has moved yet.

## Target layout

```text
dudesphere/
  apps/
    api/                  the NestJS app: today's src/, test/, vitest configs, .env
    web/                  Nuxt 4, Vue 3.5
  packages/
    api-types/            response shapes both apps read
    config/               shared tsconfig base, oxlint and oxfmt config
  context/                these docs
  .agents/                skills
  docker-compose.yml      Postgres and Mongo, as today
  pnpm-workspace.yaml
  package.json            root scripts only
  AGENTS.md
```

The root `package.json` keeps no app code. It holds the workspace scripts and
the tools both apps share: oxlint, oxfmt, TypeScript.

## The move, step by step

Each step is one commit. The test suite runs green after each one.

1. Add `pnpm-workspace.yaml` with `apps/*` and `packages/*`.
2. `git mv` the Nest files into `apps/api`: `src/`, `test/`, `package.json`,
   `nest-cli.json`, `tsconfig*.json`, `vitest.config*.ts`, `.env`,
   `.env.example`. Rename the package to `@dudesphere/api`.
3. Fix every path that assumed the repo root. Known ones: the `lint` and
   `format` scripts, `test/global-setup.ts`, `test/local-databases.ts`, the
   TypeORM data source used by the migrations, the seed scripts under
   `src/database/seeds/`, and the paths in `DEVELOPMENT.md`.
4. Run `pnpm --filter api test` and `pnpm --filter api test:e2e`. Both must
   pass before the next step.
5. Add `packages/config` and point `apps/api/tsconfig.json` at its base.
6. Add `packages/api-types` (see below).
7. Scaffold `apps/web` with `npx nuxi init`. Rename it `@dudesphere/web`.
8. Add the root scripts (see below) and update `AGENTS.md` and
   `DEVELOPMENT.md` to name the new paths.

## Shared types

`packages/api-types` exports TypeScript types only. No runtime code, no
decorators. The first version is hand-written from the response DTOs:

| Type              | Source in `apps/api`                                |
| ----------------- | --------------------------------------------------- |
| `Paginated`       | `src/shared/pagination/paginated.interface.ts`      |
| `UserResponse`    | `src/users/dto/user-response.dto.ts`                |
| `ProfileResponse` | `src/profiles/dto/profile-response.dto.ts`          |
| `AbidingResponse` | `src/abidings/dto/abiding-response.dto.ts`          |
| `HashtagResponse` | `src/hashtags/dto/hashtag-response.dto.ts`          |
| `JwtPayload`      | `src/auth/auth-user.ts` (`sub`, `username`, `role`) |

The DTO classes stay in `apps/api`. They carry `class-validator` and
`class-transformer` decorators, and those do not belong in a browser bundle.

Generating the types from the classes is deferred. When the hand-written
copy drifts, a compile-time check in `apps/api` that assigns each DTO to its
shared type will catch it. Add that check in step 6.

## Root scripts

| Script          | Runs                                                      |
| --------------- | --------------------------------------------------------- |
| `pnpm dev`      | both apps in watch mode, through `pnpm -r --parallel dev` |
| `pnpm dev:api`  | `pnpm --filter @dudesphere/api start:dev`                 |
| `pnpm dev:web`  | `pnpm --filter @dudesphere/web dev`                       |
| `pnpm test`     | every package's unit tests                                |
| `pnpm test:e2e` | the API's e2e suite, then the web app's Playwright suite  |
| `pnpm lint`     | oxlint across the workspace                               |
| `pnpm format`   | oxfmt across the workspace                                |

Ports: the API listens on 3000, the default in
`src/config/env.validate.ts`. The web app takes 3001. The web app reads the
API origin from `runtimeConfig.apiUrl`, a private key set by the
`NUXT_API_URL` environment variable. Private runtime config stays on the
server, so the browser never learns the origin.

## No CORS

The browser never calls the API. Nitro server routes and server-side
`useFetch` in `apps/web` call `http://localhost:3000` server to server. So
`enableCors` stays off in `src/app-setup.ts`, and the JWT never reaches page
scripts.

Cost accepted: every API call from the browser makes one extra hop through
`apps/web`. For this app that is fine. If a feature later needs the browser
to talk to Nest directly, such as a WebSocket feed, turn CORS on for the web
origin only, and say why in `overview.md`.

## What does not change

- Docker Compose still runs only the two databases. Both apps run locally.
- The e2e cleanup job in `test/global-setup.ts` and the `e2e-` prefix rule
  stay as they are.
- The zero-`Date` policy and `@northguild/gmt` apply to `apps/web` as well.
  Timestamps cross the API as ISO 8601 UTC strings and stay strings in the
  browser until a formatter needs them.
- Postgres changes still go through migrations in
  `apps/api/src/database/migrations/`.
