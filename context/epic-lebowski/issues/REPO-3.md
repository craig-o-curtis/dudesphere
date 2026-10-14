# REPO-3: Shared response types in packages/api-types

Part of the Lebowski epic. See [index.md](../index.md). Realm: Repo. Phase 0. Blocked by: none.

**Scope:** `packages/api-types` exports hand-written TypeScript types for every API response the web app reads, and a type-level contract file in the API fails the build when a DTO and its shared type drift apart.

## Gap

The web app will read users, profiles, abidings, hashtags, token pairs and error bodies from Nest. Without shared types, `apps/web` would copy each shape by hand, and a renamed field in a Nest DTO would surface as `undefined` on a page, at run time. Generated types (OpenAPI) are deferred; this story keeps the cost low with a hand-written file and a compile-time check.

## Scope

- `packages/api-types/package.json`: name `@dudesphere/api-types`, `private: true`, `type: module`, `"types": "./index.d.ts"`, `"exports": { ".": { "types": "./index.d.ts" } }`. No build, no runtime code.
- `packages/api-types/index.d.ts` exports:
  - `Paginated<T>`: `{ data: T[]; meta: { itemsPerPage: number; totalItems: number; currentPage: number; totalPages: number }; links: { first: string; last: string; current: string; next: string | null; previous: string | null } }`. Copy the field names from `apps/api/src/shared/pagination/`, not from this line.
  - `UserRole`: `"admin" | "user"`.
  - `UserResponse`: the `UserResponseDto` fields without `password` and `deletedAt`.
  - `ProfileResponse`: `id`, `userId`, `displayName`, `bio`, `profileImageUrl`, `isDude`, `ordainedDate`, `createdAt`, `updatedAt`. Timestamps are ISO 8601 UTC strings.
  - `AbidingResponse`: `id`, `userId`, `message`, `imageUrl`, `displayName`, `hashtags`, `replyToId`, `createdAt`, `updatedAt`.
  - `HashtagResponse`: the `HashtagResponseDto` fields.
  - `ApiErrorCode`: the string values of `ErrorCode` in `apps/api/src/shared/error-codes.ts`.
  - `ApiError`: the error body the API's filters send, including the field messages of a 400.
  - `TokenPair`: `{ accessToken: string; refreshToken: string; expiresIn: number }`.
- `apps/api/package.json` adds `"@dudesphere/api-types": "workspace:*"` as a devDependency. `apps/web` adds it as a dependency in WEB-5.
- `apps/api/src/shared/api-types.contract.ts`: for each pair, a type-level assertion `Same<A, B>`, true when `A extends B` and `B extends A`. Example:

  ```ts
  type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
  const userMatches: Same<Omit<UserResponseDto, "password" | "deletedAt">, UserResponse> = true;
  ```

  Enums compare through template literal types, `` `${ErrorCode}` `` against `ApiErrorCode`.

## Design notes

- **A `.d.ts`, not a `.ts`.** A `.ts` file outside `apps/api` would fall foul of the API's `rootDir: "."`. A declaration file is read for types only and never compiled.
- **No `JwtClaims`.** The browser never sees the JWT (AUTH-7), so the web app has no use for its claims.
- **Zero runtime.** The contract file holds types and `true` constants only. `typecheck` and `nest build` catch drift; nothing ships.
- **The DTOs stay the source of truth.** When a DTO changes, the contract fails, and the fix goes into `index.d.ts`.
- **New stories extend it.** Each API story in this epic adds its response type here and a `Same<>` line to the contract.

## Verification

- `pnpm typecheck` passes at the root.
- Rename `displayName` in `AbidingResponseDto` to `name`. `pnpm --filter @dudesphere/api typecheck` fails on the contract line. Revert.
- Add a value to `ErrorCode` without adding it to `ApiErrorCode`. The typecheck fails. Revert.
- `apps/api/dist/` holds no file from `packages/api-types`.

## Done when

- [ ] `packages/api-types` with `package.json` and `index.d.ts`
- [ ] `apps/api/src/shared/api-types.contract.ts` covers every exported type
- [ ] Both drift checks above fail as expected, then pass after the revert
- [ ] `context/fullstack-architecture.md` says how to add a type
