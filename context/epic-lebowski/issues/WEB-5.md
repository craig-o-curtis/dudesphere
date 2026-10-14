# WEB-5: Next.js 16.4 app shell

Part of the Lebowski epic. See [index.md](../index.md). Realm: Web. Phase 0. Blocked by: REPO-2.

**Scope:** `apps/web` holds a Next.js 16.4 and React 19.3 app named `@dudesphere/web`, with Cache Components, the React Compiler and CSS Modules on, linted and formatted from the root, and `pnpm dev` starts it on port 3001 beside the API on 3000.

## Gap

The frontend plan chose Nuxt and was never built. Craig reversed that on 2026-10-14: the web app is Next.js, on the newest Next and React, built as a lesson in every rendering strategy Next offers. No story after this one can start until the app exists, builds in CI and obeys the repo's zero-`Date` rule.

## Scope

**Built on 2026-10-14** in commit `5acc663`, on branch `chore/fullstack-setup`. This
section records what landed, and where it differs from the first plan.

**Scaffold**, run from `apps/` with create-next-app 16.4.0:

```sh
pnpm dlx create-next-app@16.4.0 web --typescript --app --src-dir --no-tailwind --no-eslint \
  --no-biome --react-compiler --cache-components --import-alias "@/*" --use-pnpm \
  --skip-install --disable-git --no-agent-feedback --yes
```

**Reconciled**:

- `apps/web/package.json`:
  - name `@dudesphere/web`, `private: true`, `engines.node` `^26`. No `type`: Next reads its config either way.
  - scripts: `dev: next dev -p 3001`, `build: next build`, `start: next start -p 3001`, `typecheck: next typegen && tsc --noEmit`, `test: vitest run`. No `lint`: the root runs it.
  - dependencies: `next` 16.4.0, `react` and `react-dom` 19.3.0, `@northguild/gmt`, `server-only`, `@tanstack/react-query`, `motion`, `@dudesphere/lane-engine: workspace:*`.
  - devDependencies: `@dudesphere/api-types: workspace:*` (types only), `babel-plugin-react-compiler`, `@types/node@^26`, `@types/react`, `@types/react-dom`, `typescript@^6`, and the test stack: `vitest`, `jsdom`, `@vitejs/plugin-react`, `vite-tsconfig-paths`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/jest-dom`.
- The scaffold's own `pnpm-workspace.yaml` and its `packageManager: pnpm@10` pin are removed: the root owns both.
- `apps/web/tsconfig.json` extends `../../packages/config/tsconfig.base.json` and keeps Next's own options (`jsx`, `moduleResolution: bundler`, the `next` plugin, `paths` for `@/*`).
- `apps/web/next.config.ts`:

  ```ts
  const nextConfig: NextConfig = {
    cacheComponents: true,
    partialPrefetching: true,
    reactCompiler: true,
    experimental: { agentFeedback: false },
  };
  ```

  **No `transpilePackages`.** `lane-engine` is built to plain JavaScript in `dist/`, and `api-types` is types only, so Next needs no help with either. Add it only if a package's `exports` ever points at `.ts` source.

- **`apps/web/AGENTS.md` stays.** `next dev` writes its block back whenever the file is missing or changed, so deleting it only leaves a change that keeps coming back. The file now opens with a pointer to the root `AGENTS.md`, then Next's block, which sends agents to the docs that ship in `node_modules/next/dist/docs`. `agentRules` stays on for that reason.
- Deleted: `apps/web/README.md`, the Next and Vercel logos in `public/`, and the scaffold's boilerplate page. The scaffold wrote no ESLint files, because of `--no-eslint`.
- `apps/web/.oxlintrc.json`: extends `../../.oxlintrc.json`; `plugins: ["import", "react", "jsx-a11y", "nextjs"]`; `env: { browser: true, node: true }`; `ignorePatterns: [".next/**", "next-env.d.ts"]`.
- `apps/web/.env.example`: `API_URL=http://localhost:3000`. `apps/web/.gitignore` keeps `.env.example` in git.
- `apps/api`: the `FRONTEND_URL` default moves to `http://localhost:3001`, in `env.validate.ts`, its spec and `.env.example`.
- `.vscode/settings.json`: `typescriptreact` and `css` use the oxc formatter.
- `apps/web/src/app/page.tsx`: a placeholder that imports `FRAMES_PER_GAME` from `lane-engine`, which proves Next builds a workspace package. `page.spec.tsx` tests it. WEB-6 replaces the layout; FEED-12 replaces the page.
- `apps/web/vitest.config.ts` and `vitest.setup.ts`: jsdom, Testing Library matchers, `root: import.meta.dirname`.

## Design notes

- **Node runtime only.** The Edge runtime is deprecated. No route sets `runtime = 'edge'`.
- **`proxy.ts`, not `middleware.ts`.** Next 16 renamed it. AUTH-8 adds it.
- **CSS Modules and CSS variables. No Tailwind.** Each component has a `.module.css` beside it.
- **The gmt rules apply here too.** The root oxlint config loads `@northguild/gmt-oxlint`, so `new Date()` in `apps/web` fails lint like it does in the API.
- **TypeScript 6 against the scaffold.** Expect to delete deprecated tsconfig keys on the first `typecheck`. Confirm Next 16.4's supported TypeScript range before pinning (plan risk 4).
- **No API call in the shell.** With `cacheComponents: true`, an API read outside Suspense fails `next build`, and the CI `web` job has no API (plan risk 5).

## Rendering strategy

The placeholder page is fully static: no request-time API, no data. `next build` reports it as static. WEB-11 records it as the baseline row in `rendering-strategies.md`.

## Verification

- `pnpm dev` starts the API on 3000 and the web app on 3001.
- `pnpm --filter @dudesphere/web build` passes with Cache Components on.
- `pnpm --filter @dudesphere/web typecheck` passes.
- `pnpm lint` from the root lints `apps/web`. A scratch `new Date()` in `apps/web/src/app/page.tsx` fails it. Revert.
- `pnpm format:check` passes.
- `apps/web/README.md` and any `eslint.config.*` are absent. `apps/web/AGENTS.md` opens with the pointer to the root file.
- `pnpm --filter @dudesphere/web test` passes.

## Done when

- [x] `apps/web` scaffolded and reconciled as above
- [x] `next.config.ts` with Cache Components and React Compiler
- [x] `apps/web/.oxlintrc.json`; gmt rules fire in `apps/web`
- [x] `pnpm dev` starts both apps
- [x] CI `web` job green (REPO-4)
- [x] `DEVELOPMENT.md`, `AGENTS.md` and `fullstack-architecture.md` describe `apps/web`
- [x] Baseline row in `rendering-strategies.md`

## Follow-up

Next.js announced an out-of-band security release on 2026-10-14. On that day
16.4.0 was the newest version on npm. Move `next` to the patched 16.4.x as soon as
it ships, and run this story's verification again.
