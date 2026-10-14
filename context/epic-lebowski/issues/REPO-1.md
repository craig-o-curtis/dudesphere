# REPO-1: Monorepo move into apps/api

Part of the Lebowski epic. See [index.md](../index.md). Realm: Repo. Phase 0. Blocked by: none.

**Scope:** The NestJS app moves from the repo root into `apps/api` inside a pnpm workspace, and every script, hook, config, container and CI job that assumed the root now points at the new place.

## Gap

The repo held one NestJS app at its root. A Next.js app cannot sit beside it there: both want `package.json`, `tsconfig.json` and `src/` at the root. Shared code, such as the response types and the bowling engine, needs a `packages/` folder that both apps can depend on. Every tool that ran from the root (hooks, Docker, compose, CI, the env-leak check) had to learn the new paths, or it would silently check nothing.

## Scope

This story landed on branch `chore/fullstack-setup` on 2026-10-14, in commits `2d7780c` (prepare) and `a42c4e3` (move). It records what landed.

**The move** (plan Part D, commits C0 and C1):

- `git mv src test package.json nest-cli.json tsconfig.json tsconfig.build.json vitest.config.ts vitest.config.e2e.ts .env.example Dockerfile apps/api/`.
- The ignored `.env`, `.env.staging` and `.env.production` moved with a plain `mv` to `apps/api/`.
- `vitest.config.ts` and `vitest.config.e2e.ts` set `root: import.meta.dirname`, because Vite resolves `root: "./"` against the working directory.
- `.gitignore` unanchors `dist/`, `node_modules/`, `build/` and `coverage/`, and adds `.next/`, `out/` and `next-env.d.ts`.
- The root `dist/` and `tsconfig.build.tsbuildinfo` were removed.

**The workspace:**

- `pnpm-workspace.yaml` lists `packages: ["apps/*", "packages/*"]` and keeps `allowBuilds` with `bcrypt: false`.
- `apps/api/package.json` is `@dudesphere/api`, with `"files": ["dist"]` and `"dev": "nest start --env-file .env --watch"`. It lost `prepare`, the `format*` and `lint` scripts and the four lint devDependencies.
- `pnpm-lock.yaml` was regenerated and committed, so `pnpm install --frozen-lockfile` passes in CI.

**Root scripts** in `package.json`: `dev`, `dev:api`, `dev:web`, `build:packages`, `build`, `typecheck`, `test`, `test:e2e`, `lint` (`oxlint --type-aware`), `format`, `format:check`, `db:up` and `db:down`. Root devDependencies: `@northguild/gmt-oxlint`, `oxfmt`, `oxlint`, `oxlint-tsgolint`, `tsx`, `typescript`.

**Lint and format:**

- The root `.oxlintrc.json` is the shared base. It loads `@northguild/gmt-oxlint` through `jsPlugins` and its recommended config through `extends`, and ignores `**/dist/**`, `**/.next/**` and `**/coverage/**`.
- `apps/api/.oxlintrc.json` is new. It extends `../../.oxlintrc.json` and carries the two overrides that turn off `no-date-global` and `no-new-date` for `src/**/*.entity.ts`, `src/**/*.schema.ts` and `src/shared/**/*.ts`.
- One `oxlint --type-aware` from the root covers every app, because tsgolint builds one program per nearest `tsconfig.json`.
- `.oxfmtrc.json` did not change. One root config formats everything.

**Hooks:** `.githooks/pre-commit` runs `pnpm --silent exec tsx apps/api/src/dev/check-env-leaks.ts staged`, and `.githooks/commit-msg` runs the same file with `message "$1"`. `check-env-leaks.ts` now reads lists, not one root `.env`:

- `ENV_FILES = ["apps/api/.env", "apps/api/.env.staging", "apps/api/.env.production", "apps/web/.env.local"]`
- `EXAMPLE_FILES = ["apps/api/.env.example", "apps/web/.env.example"]`

**Compose:** `docker-compose.yml` reads `env_file: - apps/api/.env`. Compose interpolation needs `--env-file`, so `pnpm db:up` runs `docker compose --env-file apps/api/.env up -d` and `pnpm db:down` runs the matching `down`.

**Docker:** `apps/api/Dockerfile` builds from the repo root (`docker build -f apps/api/Dockerfile -t dudesphere-api .`). It copies the workspace manifests, runs `pnpm install --frozen-lockfile --ignore-scripts --filter "@dudesphere/api..."`, builds with `pnpm --filter "@dudesphere/api..." run build`, then `pnpm --filter @dudesphere/api deploy --prod /out`. The runtime stage is `node:26-alpine` running `node dist/main.js`. A root `.dockerignore` keeps `node_modules`, `dist`, `.next`, `coverage` and every `.env` except `.env.example` out of the context.

**CI:** `.github/workflows/ci.yml` keeps its three jobs. Each builds the API's workspace packages first with `pnpm --filter "@dudesphere/api^..." build`. `checks` runs `format:check`, `lint`, then `typecheck`, `test` and `build` on `--filter "@dudesphere/api..."`. `migrations` and `e2e` call `pnpm --filter @dudesphere/api <script>`. There are no `paths:` filters, because they break required checks.

**Unchanged on purpose:** `apps/api/test/global-setup.ts`, `test/local-databases.ts`, `test/routes.ts`, `src/database/data-source.ts` and the seeds. Each is relative to the working directory or to `import.meta.url`, and pnpm runs every script with the package folder as its working directory.

## Design notes

- **`.env` lives in `apps/api`.** pnpm runs each script from the package folder, so `dotenv/config`, `nest start --env-file .env` and `path.resolve(process.cwd(), ".env")` in the seeds kept working with no code change.
- **`jsPlugins` resolve against the declaring file.** That is why `@northguild/gmt-oxlint` stays a root devDependency and the per-app configs only extend the root one.
- **`pnpm deploy --prod` without `--legacy`.** The plan named `--legacy`. The Dockerfile that landed does not use it. Smoke-test the image once (plan risk 6) before WEB-45 depends on it.
- **No `paths:` filters in CI.** A job that a filter skips never reports, and a required check then waits for ever.

## Verification

- `pnpm --filter @dudesphere/api test` and `pnpm test:e2e` pass after the move.
- `pnpm --filter @dudesphere/api migration:check` passes from `apps/api`.
- `pnpm lint`, `pnpm typecheck` and `pnpm format:check` pass at the root.
- A scratch `new Date()` in an API spec makes `pnpm lint` fail with a gmt rule, which proves the nested config inherits the plugin. The scratch line was reverted.
- A test commit runs both hooks. A staged line holding a value from `apps/api/.env` is refused.
- `pnpm db:up` starts Postgres with the credentials from `apps/api/.env`, not blanks.
- `git log --follow apps/api/src/main.ts` shows the file's history from before the move.

## Done when

- [x] Nest runs from `apps/api` with `pnpm dev:api`
- [x] Root scripts, workspace file and regenerated lockfile committed
- [x] Root and `apps/api` oxlint configs, with the gmt rules still firing
- [x] Hooks call `apps/api/src/dev/check-env-leaks.ts` with the env-file lists
- [x] Compose reads `apps/api/.env`; `pnpm db:up` and `pnpm db:down` work
- [x] `apps/api/Dockerfile` and the root `.dockerignore`
- [x] CI jobs use workspace filters and pass
