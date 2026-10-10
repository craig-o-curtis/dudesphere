# NestJS Decorators

## TLDR description

A decorator is a function you put above a class, method or property with `@`.
It attaches information or logic to that code without changing it.
Nest and TypeORM read that information later.

## In this folder

### Auth

These only write metadata. A guard reads it and makes the decision.

- `@Public()` opens one route to callers with no token. `JwtAuthGuard` reads it.
- `@Roles(...roles)` limits a route, or a whole controller, to the given roles.
  `RolesGuard` reads it.

The metadata keys live in `../auth-metadata.ts`, so a decorator and its guard
cannot drift apart.

### How `@Roles` and `RolesGuard` work together

`@Roles` is the label. `RolesGuard` is the check.

```ts
@Roles(UserRole.ADMIN)
@Get()
getUsers() {}
```

1. `@Roles(UserRole.ADMIN)` stores `["admin"]` on `getUsers` under the key
   `ROLES_KEY`. It does this once, when the file loads. It blocks nobody.
2. On each request, `RolesGuard` reads that list and compares it with the
   signed-in user's role. A role outside the list gets a 403.
3. A route with no `@Roles` has no list, so `RolesGuard` lets the request
   through.

Put `@Roles` on a controller to cover every route in it. A `@Roles` on one
method replaces the controller's list for that method.

The guard side is in `../guards/README.md`.

### Validation

These go on DTO fields, next to the class-validator decorators. Each one
stops a value that the database could not hold, so the caller gets a 400 and
not a 500.

- `@MaxCodePoints(n)` is a length limit that counts the way a Postgres
  `varchar(n)` does. Use it with the column's own length. `@MaxLength` leaves
  out variation selectors, so a value could pass it and still overflow the
  column.
- `@NoNulCharacter()` rejects the NUL character, which Postgres cannot store
  in text. Use it on every string field stored in Postgres.
- `@IsUtcDateTime()` accepts one shape only: a real instant in UTC, such as
  `2026-10-06T12:00:00Z`. The check is gmt's `isValidUtc` with its
  `rfc3339DateTime` pattern.
- `@IntFromDigits(fallback?)` converts a string to a whole number and accepts
  plain digits only, so `0x10`, `1e1` and `+5` are rejected. It applies
  `@IsInt` itself. Use it, and not `@Type(() => Number)`, on any number that
  arrives as a string: a route param, a query param or an environment
  variable.
- `@MaxCommaSeparated(n)` limits how many values a comma-separated string may
  hold, such as the `?hashtag=dude,sunday` filter on `GET /abidings`. Empty
  parts do not count. It counts with `splitCommaSeparated` from
  `src/shared/utils/comma-separated.ts`; read the value with the same function.

`src/shared/dto/entity-rules.spec.ts` reads the entities and fails when a
field is missing the first two.

### Timestamp columns

Each one wraps a TypeORM column and returns the value as an ISO 8601 UTC string.

- `@CreateUtcColumn()` is set once, when the row is created.
- `@UpdateUtcColumn()` is set on creation and again on every update. It wraps
  TypeORM's `@UpdateDateColumn`, which is what makes `update()` stamp it.
- `@SoftDeleteUtcColumn()` marks the soft-delete column. It enables
  `repository.softDelete()`.
- `@UtcColumn({ nullable })` covers any other timestamp column.

All four use the Postgres type `timestamptz`, never `timestamp`. A `timestamp`
column holds a wall time with no zone, and the driver reads it in the zone of
the machine the app runs on, so the same row gave a different instant on a
different machine. A `timestamptz` column stores the instant itself.
`utc-column.decorator.ts` has the full story.
