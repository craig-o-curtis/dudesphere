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

### Timestamp columns

Each one wraps a TypeORM column and returns the value as an ISO 8601 UTC string.

- `@CreateUtcColumn()` is set once, when the row is created.
- `@UpdateUtcColumn()` is set on creation and again on every update.
- `@SoftDeleteUtcColumn()` marks the soft-delete column. It enables
  `repository.softDelete()`.
- `@UtcColumn({ nullable })` covers any other timestamp column.
- `@IsoTimestamp()` is an older general form. No entity uses it today.
