# Project checks

These are the bug classes this codebase has actually had. Each item says what to look for, why it matters and how to fix it. Cite a finding as `project-checks › <section>`.

Read only the sections the diff touches.

1. [Soft delete](#soft-delete)
2. [Transactions across services](#transactions-across-services)
3. [Postgres and Mongo](#postgres-and-mongo)
4. [DTOs and entities](#dtos-and-entities)
5. [Response mapping](#response-mapping)
6. [Loading relations](#loading-relations)
7. [Module boundaries](#module-boundaries)
8. [Auth and guards](#auth-and-guards)
9. [Errors](#errors)
10. [Migrations](#migrations)
11. [Tests](#tests)

## Soft delete

`SoftDeleteUtcColumn` wraps TypeORM's `@DeleteDateColumn`. That hides soft-deleted rows from `find*` calls, and from nothing else.

- **Conflict checks.** A lookup before writing a unique column (email, username) needs `withDeleted: true`. Without it, a deleted row passes the check, the unique index rejects the insert, and the caller gets a 500. Search every unique field in one `where: [...]`.
- **Writes by criteria.** `update()`, `softDelete()` and `restore()` don't apply the filter. Writes meant for live rows need `deletedAt: IsNull()` in the criteria. Restores need `deletedAt: Not(IsNull())`. Check that `affected === 0` produces a 404.
- **Cascades.** `ON DELETE CASCADE` never fires, because a soft delete is an `UPDATE`. Rows that belong to the deleted row, like its profile, need their own soft-delete column. Set it in the same transaction, and restore it the same way.
- **Child reads.** Reading a child by its parent's id (for example `GET /profiles/user/:userId`) must not return data for a deleted parent.
- **Backfill.** A new column that changes what's visible needs its migration to backfill existing rows.

## Transactions across services

The pattern: `UsersService.createUser`, `deleteUser` and `restoreUser` each open `dataSource.transaction`. They pass its `manager` to `ProfileService.createProfileForUser`, `softDeleteForUser` and `restoreForUser`.

- **Use `manager` for everything.** Inside the callback, every query goes through `manager`. An injected repository runs outside the transaction and won't roll back.
- **Let errors escape.** A `try`/`catch` or `.catch()` that swallows an error commits half the work.
- **Test both.** Tests should check that the same `manager` reaches the other service, and that a failure in the second write makes the call reject.

## Postgres and Mongo

Users and profiles live in Postgres (TypeORM). Abidings live in Mongo (Mongoose) and link to users by a plain `userId`. There's no foreign key and no TypeORM relation between the two.

- **Join in code.** Collect the distinct ids, load them with one `findBy({ id: In(ids) })` (`UsersService.getUsersByIds`), then look each one up in a `Map`.
  - Flag code that loads a page with `getUsers()` and then calls `.find()` on it. Anyone past the first page is missed.
  - Flag one lookup per item. That's an N+1.
- **Bound Mongo lists.** A per-user list needs a sort and a limit. The `{ userId: 1, createdAt: -1 }` index exists for this.
- **Nesting across databases.** Putting Mongo data inside a Postgres-backed response ties the endpoint to both databases. It also tends to create module cycles; see [Module boundaries](#module-boundaries).

## DTOs and entities

- **Lengths must match.** `@MaxLength` must equal the column's `varchar` length. Otherwise a valid DTO fails in Postgres as a 500. `src/users/dto/create-user.dto.spec.ts` has a test that reads the length from entity metadata. Extend it when you add sized fields.
- **Strip what a route doesn't own.** Fields the route mustn't change get removed in the service. For example, user updates drop `profile`, because profiles are updated through `/profiles`.

## Response mapping

Services return DTOs built by a mapper, such as `UsersService.toResponseDto` or `ProfileResponseDto.fromEntity`. They never return entities.

- **Loaded isn't returned.** A relation loaded with `relations` but not passed to the mapper never reaches the client. Follow each new field from the query, through the mapper, to the DTO.
- **`undefined` vs `null`.** `undefined` keys disappear from the JSON, while `null` keys stay. Choose deliberately.
- **Secrets stay out.** `password` is `@Exclude()`d and never mapped.

## Loading relations

Prefer `relations: { x: true }` on the query that needs it. Flag `eager: true` unless nearly every query on that entity uses the relation. Eager loading adds the join to every `find`, and QueryBuilder ignores it anyway.

## Module boundaries

The current imports are `UsersModule → ProfileModule`, `AbidingModule → UsersModule` and `AuthModule → UsersModule`.

- **Cycles.** A new import that closes a cycle is a hard finding (`arch-avoid-circular-deps`). Don't accept `forwardRef` as the fix; it hides the cycle.
- **Combining services.** Code that combines several services' results may live in the controller, because `arch-single-responsibility` allows orchestration there. Rules about one entity belong in that entity's service.
- **Reaching into another feature's table.** `TypeOrmModule.forFeature([Other])` in a different feature skips that feature's service rules, soft delete included. A known case is `ProfileModule` registering `User` for its seed.

## Auth and guards

Login (`POST /auth`) checks the email and password and returns a signed JWT. `JwtAuthGuard` verifies it and puts `{ userId, username, role }` on the request. Read it with `@CurrentUser()`.

- **"Mine" comes from the token.** A route for the caller's own data (for example `GET /profiles/me`) takes the user id from `@CurrentUser()`, never from the URL or the body.
- **Don't import `AuthModule` into a feature.** `AuthModule → UsersModule → ProfileModule`, so that import closes a cycle. The guard needs only `JwtService`, which is registered globally. Use `@UseGuards(JwtAuthGuard)` directly.
- **Guards are tested in e2e.** A controller spec overrides the guard. The 401 cases live in `test/`.
- **Known gaps, not blockers.** Only `GET /profiles/me` is guarded so far, and nothing checks `role`. Flag new destructive or admin routes (delete, restore, role changes) as unguarded. Don't re-report routes that already existed. Passwords are stored as plain text.

## Errors

- **Use Nest HTTP exceptions.** Throw `NotFoundException`, `ConflictException` and so on. A plain `throw new Error()` becomes a 500. `AbidingService` still does this; flag new cases, not the existing ones.
- **The filter is a safety net.** `QueryFailedFilter` (`src/shared/filters/`) turns Postgres unique violations (`23505`) into a 409, for races. It doesn't replace a conflict check in the service.

## Migrations

- **Every column change needs a migration.** `synchronize` is `false`. Generate one with `pnpm migration:generate src/database/migrations/<Name>`, and check for drift with `pnpm migration:check`.
- **Don't lose data.** Generated SQL that drops and re-adds a column loses its data, so convert the column in place instead. Mark hand edits with `// EDITED BY HAND:` and the reason.
- **`down()` must undo `up()`.**

## Tests

- **Logic tests go in service specs.** Controller specs only check delegation: the right arguments reach the service, and the result comes back unchanged (`toBe`). Pipes, guards, status codes and serialization only run on real HTTP requests, so they belong in e2e tests (`test/`, `pnpm test:e2e`).
- **Bug fixes need a test.** It should fail without the fix.
- **Use distinct values.** Pass arguments that differ from the defaults and from each other, like `getUsers(5, 2)` rather than `(10, 1)`, so swapped arguments fail.
- **Keep mocks in their own variable.** Store `vi.fn()` mocks for `EntityManager` methods in a variable. Reading them off an object cast `as EntityManager` triggers the `unbound-method` lint warning.
