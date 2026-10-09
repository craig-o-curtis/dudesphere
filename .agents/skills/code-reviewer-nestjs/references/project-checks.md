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
- **Bound every list.** A route that returns a list takes `PaginationQueryDto` (or a class that extends it) and answers with `toPaginatedResponse` from `src/shared/dto/paginated-response.ts`. Flag a list route that returns a bare array, or a query with no limit.
  - The controller calls `toPaginatedResponse` by hand, on purpose. The generic rule against wrapping a response in the handler does not apply to it.
  - Each item in `data` must be an instance of its response DTO. A spread copy loses its class, and `@Exclude` with it.
- **Sort every list.** A paged query with no fixed order can repeat a row or skip one. Postgres lists use `order: { id: "ASC" }`. Abidings sort by `{ createdAt: -1, _id: -1 }`, and each list index in `abiding.schema.ts` ends with those two keys. Flag a new list filter that no index serves.
- **Count with the filter you read with.** `totalItems` has to describe the list the caller is paging through. The Mongo counts read every matching document, which is accepted and explained on `AbidingsService.findPage`. Don't flag it again; do flag a new count that reads more than its list's filter matches.
- **Cap a list that arrives in the URL.** `GET /abidings` takes at most `MAX_TAGS` tags (`@MaxCommaSeparated`). Mongo sorts in memory once an `$in` passes 200 values. Flag a new comma-separated or repeated param with no limit.
- **Check references in the service.** Mongo has no foreign keys. A field that names another document, such as an abiding's `replyToId`, needs its shape checked in the DTO (`@IsMongoId`) and its target checked in the service (`AbidingsService.assertReplyTargetExists`). Flag a new reference field with neither.
- **Updates skip the schema.** `findOneAndUpdate`, `updateOne` and `updateMany` run no schema validators unless the call passes `runValidators: true`.
- **Nesting across databases.** Putting Mongo data inside a Postgres-backed response ties the endpoint to both databases. It also tends to create module cycles; see [Module boundaries](#module-boundaries).

## DTOs and entities

- **Lengths must match.** `@MaxLength` must equal the column's `varchar` length. Otherwise a valid DTO fails in Postgres as a 500. `src/users/dto/create-user.dto.spec.ts` has a test that reads the length from entity metadata. Extend it when you add sized fields.
- **Strip what a route doesn't own.** Fields the route mustn't change get removed in the service. For example, user updates drop `profile`, because profiles are updated through `/profiles`.

## Response mapping

Services return DTOs built by a mapper, such as `UsersService.toResponseDto` or `ProfileResponseDto.fromEntity`. They never return entities.

- **Loaded isn't returned.** A relation loaded with `relations` but not passed to the mapper never reaches the client. Follow each new field from the query, through the mapper, to the DTO.
- **Build a response in one place.** `AbidingsController.toResponse` is the only place an abiding becomes an `AbidingResponseDto`, and it passes on everything the service returned. Five routes once listed the fields by hand, and `imageUrl` and `updatedAt` were left off all five. Flag a controller that lists a response's fields by hand in more than one place.
- **Accepted is not stored.** Follow each field of a create or update DTO to the write. `CreateAbidingDto.imageUrl` was validated and then never passed to the model.
- **`undefined` vs `null`.** `undefined` keys disappear from the JSON, while `null` keys stay. Choose deliberately.
- **Secrets stay out.** `password` is `@Exclude()`d and never mapped.

## Loading relations

Prefer `relations: { x: true }` on the query that needs it. Flag `eager: true` unless nearly every query on that entity uses the relation. Eager loading adds the join to every `find`, and QueryBuilder ignores it anyway.

## Module boundaries

The current imports are `UsersModule → ProfilesModule`, `AbidingsModule → UsersModule` and `AuthModule → UsersModule`.

- **Cycles.** A new import that closes a cycle is a hard finding (`arch-avoid-circular-deps`). Don't accept `forwardRef` as the fix; it hides the cycle.
- **Combining services.** Code that combines several services' results may live in the controller, because `arch-single-responsibility` allows orchestration there. Rules about one entity belong in that entity's service.
- **Reaching into another feature's table.** `TypeOrmModule.forFeature([Other])` in a different feature skips that feature's service rules, soft delete included. A known case is `ProfilesModule` registering `User` for its seed.

## Auth and guards

Login (`POST /auth`) checks the email and password and returns a signed JWT. `JwtAuthGuard` verifies it and puts `{ userId, username, role }` on the request. Read it with `@CurrentUser()`.

- **"Mine" comes from the token.** A route for the caller's own data (for example `GET /profiles/me`) takes the user id from `@CurrentUser()`, never from the URL or the body.
- **Don't import `AuthModule` into a feature.** `AuthModule → UsersModule → ProfilesModule`, so that import closes a cycle. The guard needs only `JwtService`, which is registered globally. Use `@UseGuards(JwtAuthGuard)` directly.
- **Guards are tested in e2e.** A controller spec overrides the guard. The 401 cases live in `test/`.
- **A token is optional on a `@Public()` route.** `JwtAuthGuard` still reads a good token there and puts the user on the request, so the fault log names a signed-in caller and `@CurrentUser()` works. A missing or bad token is ignored. Flag a public route that treats `@CurrentUser()` as always present: it is `undefined` for an anonymous caller.
- **Routes are guarded by default.** `JwtAuthGuard` and `RolesGuard` are global. A route is open only with `@Public()`, and admin-only with `@Roles(UserRole.ADMIN)`. Flag a new destructive or admin route (delete, restore, role changes) that has neither a role nor an ownership check.
- **Passwords are hashed.** Every write of `user.password` goes through `HashingProvider` (`src/hashing`), and login compares through it. Flag a plain write, or a compare with `===`. The hasher lives outside `AuthModule` so `UsersModule` can import it without a cycle.

## Errors

- **Use Nest HTTP exceptions.** Throw `NotFoundException`, `ConflictException` and so on. A plain `throw new Error()` becomes a 500 with no detail. Nothing on a request path throws a plain `Error` any more; flag a new one.
- **Wrap with `cause`.** A `catch` that throws a fresh exception passes the original as `{ cause: error }`. It does not log the original itself: `AllExceptionsFilter` (`src/shared/filters/`) logs the cause of every 5xx with the route, user and request id. Flag a `logger.error` next to a rethrow.
- **A named failure is a class.** `src/shared/exceptions/` holds one class for each failure that is thrown from more than one place, or chosen from data: `ValueTakenException`, `NotOwnerException`, `TokenMissingException`, `DatabaseUnavailableException`, `InvalidValueException`, `TimeLimitExceededException` and `DatabaseFaultException`. Each extends the built-in exception for its status, so Nest answers it the same way. Flag one of these failures built by hand, such as `new ForbiddenException(..., { errorCode: ErrorCode.NOT_OWNER })`. Flag a new failure thrown from a second place with no class. Flag a new class that fits neither half of the rule: a one-off throw keeps the built-in class.
- **Add `errorCode` where a client would branch.** Codes live in `src/shared/error-codes.ts`. A 409 for a taken field, a 401 for a missing or bad token, a 403 for not owning the row or lacking the role, and every 503 carry one. Not every throw needs one; a plain 404 does not.
- **The filters are a safety net.** `QueryFailedFilter` turns Postgres `23505` into a 409 and `MongoErrorFilter` does the same for Mongo `11000`, for races. Neither replaces a conflict check in the service. Everything else from either database stays a 500 on purpose.
- **A value the database refuses is a 400, and a bug.** `QueryFailedFilter` turns the Postgres codes listed in `src/shared/filters/bad-value-states.ts` (too long, not a date, a NUL character, bad text for the type) into a 400 with a fixed message, and logs a warning with the route and request id. The DTO is still the place to stop the value: flag a new field stored in Postgres that lacks `@MaxCodePoints` for a sized column or `@NoNulCharacter` for a string, and flag an update DTO built with `PartialType` that does not pass `{ skipNullProperties: false }`. A not-null violation (`23502`) stays a 500 on purpose; do not add it to the list. `MongoErrorFilter` does the same for Mongoose's `ValidationError` and `CastError`. A Mongoose write that should obey the schema needs `runValidators: true`: `findOneAndUpdate`, `updateOne` and `updateMany` skip the schema's rules without it.
- **A database that cannot be reached is a 503.** All three filters answer it with `DatabaseUnavailableException`, so the body and `DATABASE_UNAVAILABLE` are the same for Postgres and Mongo. `AllExceptionsFilter` handles the case where a driver throws a plain `Error`, as pg does when Postgres refuses the connection. Flag a service that catches a database error to build its own 503: the error must escape so a transaction rolls back, and the filters already map it.
- **Requests and queries share one time limit.** `TimeoutInterceptor` (`src/shared/interceptors/`) answers 408 after `REQUEST_TIMEOUT_MS`. `app.module.ts` gives Postgres the same number as `statement_timeout` and the Mongo driver the same number as `timeoutMS`, so a stuck query is stopped and its connection freed. The database filters turn a cancelled query (`57014`, `MongoOperationTimeoutError`, Mongo code 50) into the same 408. Flag a new database connection that sets no limit, and flag a change that makes the three numbers differ. Mongo's `serverSelectionTimeoutMS` must stay below the limit, or a Mongo outage answers 408 and not 503.
- **A plain socket error is read as a database outage.** `AllExceptionsFilter` answers `ECONNREFUSED` and its like with the `DATABASE_UNAVAILABLE` 503, because today only the two databases open outbound connections. Flag a new outbound client (HTTP, mail, a queue) that lets its connection errors escape: it must catch them and throw its own exception.
- **Query parameters stay out of the log.** A `QueryFailedError` carries the values its query ran with, such as an email and a password hash. `QueryFailedFilter` wraps its 500 so only the stack is logged. `MongoErrorFilter` does the same, because a Mongo server error can hold the document it refused. Both throw `DatabaseFaultException`. Flag code that hands a raw `QueryFailedError` or Mongo error to Nest's base filter or to a logger.
- **Filter order.** In `configureApp`, `AllExceptionsFilter` is registered first. Nest tries global filters last to first, so a catch-all registered later would swallow the specific ones. Flag a reorder.
- **No timestamps in error bodies.** The body is Nest's `{ statusCode, message, error }` plus `errorCode`. A timestamp would need `Date`, which app code does not use.

## Migrations

- **Every column change needs a migration.** `synchronize` is `false`. Generate one with `pnpm migration:generate src/database/migrations/<Name>`, and check for drift with `pnpm migration:check`.
- **Don't lose data.** Generated SQL that drops and re-adds a column loses its data, so convert the column in place instead. Mark hand edits with `// EDITED BY HAND:` and the reason.
- **`down()` must undo `up()`.**

## Tests

- **Logic tests go in service specs.** Controller specs only check delegation: the right arguments reach the service, and the result comes back unchanged (`toBe`). For a list route, that is `result.data` being the service's own `items` array. Pipes, guards, filters, status codes, error bodies and serialization only run on real HTTP requests. Those that need no database go in a `*.http.spec.ts` next to the code, with mocked services (see `src/shared/dto/id-param.http.spec.ts`). Those that need real data go in e2e tests (`test/`, `pnpm test:e2e`).
- **E2E runs only against local databases.** `test/global-setup.ts` refuses to start unless Postgres and Mongo are on this machine (`test/local-databases.ts`), because the suites write rows and the cleanup hard-deletes them. Flag a change that weakens that check. E2E users keep an `e2e-…@example.com` email, and a test hashtag is `e2e` plus 12 hex characters, the two shapes the cleanup deletes.
- **Bug fixes need a test.** It should fail without the fix.
- **Use distinct values.** Pass arguments that differ from the defaults and from each other, like `getUsers({ limit: 5, page: 2 })` rather than `{ limit: 10, page: 1 }`, so a swapped or dropped value fails.
- **Keep mocks in their own variable.** Store `vi.fn()` mocks for `EntityManager` methods in a variable. Reading them off an object cast `as EntityManager` triggers the `unbound-method` lint warning.
