# REPO-2: Shared tsconfig base in packages/config

Part of the Lebowski epic. See [index.md](../index.md). Realm: Repo. Phase 0. Blocked by: none.

**Scope:** `packages/config/tsconfig.base.json` holds the compiler options every app and package shares, and each `tsconfig.json` in the workspace extends it by relative path.

## Gap

`apps/api/tsconfig.json` holds every compiler option itself. `apps/web` and the packages need the same strictness. Without one base, `strict` or `isolatedModules` can drift between apps, and a type that checks in one app fails in the other.

## Scope

- `packages/config/package.json`: name `@dudesphere/config`, `private: true`, `type: module`. No scripts and no build: nothing imports it by name.
- `packages/config/tsconfig.base.json`, only the options both apps share:
  - `strict: true`
  - `skipLibCheck: true`
  - `isolatedModules: true`
  - `esModuleInterop: true`
  - `allowSyntheticDefaultImports: true`
  - `resolvePackageJsonExports: true`
- `apps/api/tsconfig.json` gains `"extends": "../../packages/config/tsconfig.base.json"` and drops the options the base now sets.
- `apps/web/tsconfig.json` (WEB-5) and each later `packages/*/tsconfig.json` extend the same file.

## Design notes

- **Relative `extends`, no install step.** A package-name `extends` would need `@dudesphere/config` in every app's dependencies. The relative path needs nothing and works for `tsc`, `nest build`, `next build` and tsgolint.
- **Module system stays per app.** `module`, `moduleResolution`, `target`, `jsx`, decorator options, `rootDir`, `outDir` and `types` differ between Nest, Next and the libraries. They stay in each app's own file.
- **No oxlint config here.** `.oxlintrc.json` cannot extend a package name, so the shared lint base stays at the root (REPO-1).

## Verification

- `pnpm typecheck` passes at the root.
- `pnpm --filter @dudesphere/api build` produces the same `dist/` file list as before.
- Removing `strict` from the base makes `pnpm typecheck` fail in the API. Restore it after the check.
- `pnpm lint` still type-checks the API through tsgolint.

## Done when

- [ ] `packages/config/package.json` and `tsconfig.base.json` committed
- [ ] `apps/api/tsconfig.json` extends the base and drops the shared options
- [ ] `pnpm typecheck`, `pnpm lint` and the API build pass
- [ ] `context/fullstack-architecture.md` names the base file
