# REPO-4: CI per app

Part of the Lebowski epic. See [index.md](../index.md). Realm: Repo. Phase 0. Blocked by: none.

**Scope:** CI runs the API's checks, migrations and e2e jobs on workspace filters, and a new `web` job lints, type-checks and builds `apps/web` with no databases.

## Gap

REPO-1 pointed the three existing jobs at `apps/api`. The web app (WEB-5) has no job yet, so a broken `next build` or a type error in `apps/web` would merge. With `cacheComponents: true`, a page that reads the API outside Suspense fails `next build`, and only a build catches it.

## Scope

`.github/workflows/ci.yml`:

- **Setup, every job:** `actions/checkout`, `pnpm/action-setup`, `actions/setup-node` with `node-version-file: .node-version` and `cache: pnpm`, then `pnpm install --frozen-lockfile`. Unchanged.
- **`checks`:** `pnpm format:check`, `pnpm lint`, then `pnpm --filter "@dudesphere/api^..." build`, then `typecheck`, `test` and `build` on `--filter "@dudesphere/api..."`. Root `format:check` and `lint` cover `apps/web` too.
- **`migrations`:** Postgres 18 service; `pnpm --filter @dudesphere/api migration:run`, `migration:check`, `migration:revert`, `migration:run`, `migration:check`.
- **`e2e`:** Postgres and Mongo services; `migration:run`, `seed:run`, `test:e2e`, each through `pnpm --filter @dudesphere/api`.
- **`web` (new):** no services.
  - `actions/cache` on `apps/web/.next/cache`, keyed on the lockfile hash and the hash of `apps/web/**/*.{ts,tsx,css}`.
  - `pnpm --filter "@dudesphere/web^..." build`
  - `pnpm --filter @dudesphere/web typecheck` (`next typegen && tsc --noEmit`)
  - `pnpm --filter @dudesphere/web build`, with `NEXT_TELEMETRY_DISABLED: 1` and `API_URL: http://localhost:3000` in `env`.
- **Later stories add steps, not jobs:** `vitest` for `apps/web` and `packages/lane-engine` joins `checks` through `pnpm -r test`; Playwright gets its own job in WEB-46.

## Design notes

- **No `paths:` filters.** A filtered job never reports, and a required check then blocks the PR for ever. Every job runs on every PR.
- **The `web` job has no API.** `next build` must pass without Nest. That forces every API read behind Suspense, `connection()` or a request-time API, which is what Cache Components wants anyway.
- **The `web` job lands with WEB-5.** The job needs `apps/web` to exist. Both land on `chore/fullstack-setup`.
- **Required checks.** After the first green run on `main`, add `web` to the branch protection's required checks beside the other three.

## Verification

- A PR that only touches `apps/web` runs all four jobs, and all pass.
- A type error in `apps/web/src/app/page.tsx` fails `web` and leaves the API jobs green.
- A page that calls `cookies()` outside Suspense fails the `web` job's build step.
- A second run of `web` restores `.next/cache` and builds faster than the first.
- A stale lockfile fails `pnpm install --frozen-lockfile` in every job.

## Done when

- [x] `checks`, `migrations` and `e2e` use workspace filters
- [x] `web` job with cache, typecheck and build
- [x] All four jobs green on the `chore/fullstack-setup` PR
- [x] `main` has no branch protection, so there are no required checks. `DEVELOPMENT.md` says to require all four jobs when protection is turned on
- [x] `DEVELOPMENT.md` lists what each job runs
