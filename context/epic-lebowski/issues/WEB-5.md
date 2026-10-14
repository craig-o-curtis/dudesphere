# WEB-5: Next.js 16.4 app shell

Part of the Lebowski epic. See [index.md](../index.md). Realm: Web. Phase 0. Blocked by: REPO-2.

**Scope:** `apps/web` holds a Next.js 16.4 and React 19.3 app named `@dudesphere/web`, with Cache Components, the React Compiler and CSS Modules on, linted and formatted from the root, and `pnpm dev` starts it on port 3001 beside the API on 3000.

## Gap

The frontend plan chose Nuxt and was never built. Craig reversed that on 2026-10-14: the web app is Next.js, on the newest Next and React, built as a lesson in every rendering strategy Next offers. No story after this one can start until the app exists, builds in CI and obeys the repo's zero-`Date` rule.

## Scope

**Scaffold** from the repo root:

```sh
pnpm dlx create-next-app@latest apps/web --typescript --app --src-dir --no-tailwind --no-linter \
  --cache-components --react-compiler --use-pnpm --no-agent-feedback --import-alias "@/*" \
  --skip-install --disable-git
```

**Reconcile** the generated files:

- `apps/web/package.json`:
  - name `@dudesphere/web`, `private: true`, `type: module`
  - scripts: `dev: next dev -p 3001`, `build: next build`, `start: next start -p 3001`, `typecheck: next typegen && tsc --noEmit`, no `lint`
  - dependencies: `next@16.4.x` (the patched release from the 2026-10-14 security advisory), `react@19.3`, `react-dom@19.3`, `@northguild/gmt`, `server-only`, `@dudesphere/api-types: workspace:*`
  - devDependencies: `babel-plugin-react-compiler`, `@types/node@^26`, `@types/react`, `@types/react-dom`, `typescript@^6`
- `apps/web/tsconfig.json` extends `../../packages/config/tsconfig.base.json` and keeps Next's own options (`jsx`, `moduleResolution: bundler`, the `next` plugin, `paths` for `@/*`).
- `apps/web/next.config.ts`:

  ```ts
  const nextConfig: NextConfig = {
    cacheComponents: true,
    reactCompiler: true,
    agentRules: false,
    experimental: { agentUpgrade: false },
    transpilePackages: ["@dudesphere/api-types", "@dudesphere/lane-engine"],
  };
  ```

- `apps/web/.oxlintrc.json`: extends `../../.oxlintrc.json`; `plugins: ["import", "react", "jsx-a11y", "nextjs"]`; `env: { browser: true, node: true }`; `ignorePatterns: [".next/**", "next-env.d.ts"]`.
- Delete the generated ESLint files, `apps/web/AGENTS.md` (the root one is the only one) and `apps/web/README.md`.
- `apps/web/.env.example`: `API_URL=http://localhost:3000`.
- `apps/api/.env.example`: the `FRONTEND_URL` note says `http://localhost:3001`.
- `.vscode/settings.json`: add `typescriptreact` and `css` to the oxc formatter's languages.
- `apps/web/src/app/layout.tsx` and `page.tsx`: a placeholder page that renders with no API call. WEB-6 replaces the layout; FEED-12 replaces the page.
- `pnpm format` once, then one `next build` before committing, because Next edits `tsconfig.json` on its first run.

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
- `apps/web/AGENTS.md`, `README.md` and any `eslint.config.*` are absent.
- The installed `next` version is the patched 16.4.x.

## Done when

- [ ] `apps/web` scaffolded and reconciled as above
- [ ] `next.config.ts` with Cache Components, React Compiler and `transpilePackages`
- [ ] `apps/web/.oxlintrc.json`; gmt rules fire in `apps/web`
- [ ] `pnpm dev` starts both apps
- [ ] CI `web` job green (REPO-4)
- [ ] `DEVELOPMENT.md`, `AGENTS.md` and `fullstack-architecture.md` describe `apps/web`
- [ ] Baseline row in `rendering-strategies.md`
