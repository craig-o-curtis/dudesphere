# NestJS Guards

## TLDR description

A guard decides whether a request may reach its route handler. It runs after
middleware and before pipes. It knows which handler is about to run, so it can
read the decorators on that handler. It returns `true` to let the request
through, or throws to refuse it.

## In this folder

- `roles.guard.ts` holds `RolesGuard`. It limits a route to certain roles.
- `roles.guard.spec.ts` tests it.

## How `@Roles` and `RolesGuard` work together

`@Roles` decides nothing. It writes a note on the route. `RolesGuard` reads
that note on every request and makes the decision.

```ts
@Roles(UserRole.ADMIN)
@Get()
getUsers() {}
```

1. When the file loads, `@Roles(UserRole.ADMIN)` stores `["admin"]` on
   `getUsers` under the key `ROLES_KEY`.
2. A request arrives. `JwtAuthGuard` checks the token and puts the user on the
   request.
3. `RolesGuard` asks Nest's `Reflector` for the list stored under `ROLES_KEY`.
   It looks on the method first, then on the controller. A `@Roles` on the
   method replaces one on the controller.
4. `RolesGuard` compares the list with `user.role`:
   - no list, so no `@Roles` on the route: the request passes;
   - the role is in the list: the request passes;
   - the role is not in the list: 403, with the `ROLE_REQUIRED` error code.

Both files import `ROLES_KEY` from `../auth-metadata.ts`. A typo in one of them
would mean the guard never finds the list, so the key lives in one place.

## Where it is wired in

`AppModule` registers it as an `APP_GUARD`, after `JwtAuthGuard`
(`src/auth/guards/jwt-auth.guard.ts`). The order matters: `JwtAuthGuard` puts
the user on the request and `RolesGuard` reads it.

Both guards are global, so a route needs no `@UseGuards`.
