# NestJS Guards

## TLDR description

A guard decides whether a request may reach its route handler. It runs after
middleware and before pipes. It knows which handler is about to run, so it can
read the decorators on that handler. It returns `true` to let the request
through, or throws to refuse it.

A decorator on a route decides nothing. It writes a note on the route. A guard
reads that note on every request and makes the decision.

## In this folder

Everything that decides who may call a route is here. Each decorator sits
beside the guard that reads it, and each decorator file holds its own key.

| Guard                     | Decorator it reads                 | What the pair does                     |
| ------------------------- | ---------------------------------- | -------------------------------------- |
| `auth-throttler.guard.ts` | `throttle-by-account.decorator.ts` | Rate limits. 429 when over the limit.  |
| `jwt-auth.guard.ts`       | `public.decorator.ts`              | Checks the token. 401 when it is bad.  |
| `roles.guard.ts`          | `auth.decorator.ts`                | Checks the role. 403 when it is wrong. |

Also here:

- `auth-user.ts` holds `AuthUser`, the user `JwtAuthGuard` puts on the
  request, and `JwtPayload`, what signing in puts in the access token: the
  member's id, their username and the session's id, and no role.
- `current-user.decorator.ts` holds `@CurrentUser()`, which hands that user to
  a route handler.
- `route-access.spec.ts` fails when a route carries no label, or two.
- Each guard and decorator has a spec beside it.

## What goes on a route

Every route carries exactly one of these two.

```ts
@Public()                // anyone, no token needed
@Get()
getAbidings() {}

@Auth()                  // any signed-in caller
@Get("me")
getMyUser() {}

@Auth(UserRole.ADMIN)    // a signed-in admin
@Delete(":id")
deleteUser() {}
```

A route needs no `@UseGuards`. `AppModule` registers all three guards as
`APP_GUARD`, so they run on every route in the app.

A route that someone forgot to label still needs a token, so the mistake fails
`route-access.spec.ts` and never opens the route.

## One request through the three guards

Take `DELETE /users/7`, which carries `@Auth(UserRole.ADMIN)`.

1. **`AuthThrottlerGuard` counts the request.** Over 100 a minute from one IP
   address, it answers 429. It goes first so that a request with a guessed
   token is counted before it is turned away.
2. **`JwtAuthGuard` checks the token, then loads its user.** It asks
   `Reflector` whether the route carries `@Public()`. This one does not, so a
   token is required.
   - No `Authorization: Bearer` header: 401 `TOKEN_MISSING`.
   - A token that is forged, expired, for another audience or signed with
     another algorithm: 401 `TOKEN_INVALID`.
   - A real token whose user is gone, or whose password changed after it was
     signed: 401 `TOKEN_INVALID`.
   - A real token whose session has ended: 401 `TOKEN_INVALID`.
   - A good token for a live user: it puts `{ userId, username, role }` on
     `request.user`. The id comes from the token. The username and the role
     come from the database.
3. **`RolesGuard` checks the role.** It asks `Reflector` for the list `@Auth`
   stored, here `["admin"]`, and compares it with `request.user.role`.
   - The role is in the list: the request passes.
   - The role is not in the list: 403 `ROLE_REQUIRED`.
4. The pipes run, then the handler.

The order is the order of the three `APP_GUARD` lines in `src/app.module.ts`.
It matters: `RolesGuard` reads the user that `JwtAuthGuard` writes.

## How `@Auth` and `RolesGuard` work together

`@Auth(...roles)` stores its list of roles on the route under `ROLES_KEY`. It
does this once, when the file loads. `RolesGuard` reads the list on each
request. There are three cases:

| The route carries       | The list    | `RolesGuard` does                           |
| ----------------------- | ----------- | ------------------------------------------- |
| `@Public()`, no `@Auth` | none        | Nothing. The request passes.                |
| `@Auth()`               | `[]`        | Needs a signed-in user. Any role passes.    |
| `@Auth(UserRole.ADMIN)` | `["admin"]` | Needs a signed-in user with a role in list. |

`RolesGuard` looks on the method first, then on the controller. So `@Auth` on
a controller covers every route in it, and an `@Auth` on one method replaces
the controller's list for that method.

`RolesGuard` imports `ROLES_KEY` from `auth.decorator.ts`. The key is defined
once, in the decorator's file, so the two cannot drift apart.

## How `@Public` and `JwtAuthGuard` work together

`@Public()` stores `true` on the route under `IS_PUBLIC_KEY`. `JwtAuthGuard`
reads it. On a public route the token is optional:

- no token: the request passes, and `request.user` is not set;
- a good token: the request passes, and `request.user` is set;
- a bad token: the request passes, and `request.user` is not set.

So `@CurrentUser()` can be `undefined` on a public route.

## Why the guard reads the database

A token cannot change once it is signed. It is a snapshot of the moment the
member logged in. So it is trusted for two things only: which member it was
signed for, and which session it belongs to. Everything else is read fresh on
every signed-in request, by two small queries that run side by side:

- `UsersService.getUserForToken` reads who the member is now.
- `RefreshTokensService.isSessionLive` reads whether the session is still
  going. The access token names its session in its `sid` claim. The session
  is the family of refresh tokens that one sign-in started, kept in the
  `refresh_token` table. `src/auth/token.service.ts` has the rules.

A token from `pnpm dev:token` names no session and skips the second query.
Only the app can sign one.

| What happened after login         | What the same token gets            |
| --------------------------------- | ----------------------------------- |
| The member signed out             | 401 `TOKEN_INVALID`                 |
| A refresh token was used twice    | 401 `TOKEN_INVALID`                 |
| The account was closed            | 401 `TOKEN_INVALID`                 |
| The password was changed or reset | 401 `TOKEN_INVALID`                 |
| An admin was made a plain member  | 403 `ROLE_REQUIRED` on admin routes |
| A member was made an admin        | Admin routes open                   |
| The username was changed          | The new name on `request.user`      |

The token carries no role, so there is nothing for a caller to change and
nothing for a client to read that could be out of date. A client asks
`GET /users/me`.

What stops a caller from signing their own token is `JWT_SECRET`. The app
will not start with one shorter than 32 characters, and only tokens signed
with HS256 are accepted. Both rules are in `src/config/env.validate.ts` and
`src/auth/auth.module.ts`.

The cost is two small queries for each signed-in request. They are not
cached. A cache would bring back the window in which a closed account or an
ended session still works.

## What is not a guard here

"This user or an admin" rules are checked in the services, not in a guard.
The check needs the row from the database, and a missing row must answer 404
before a row that belongs to someone else answers 403. See
`UsersService.getUserForCaller`, `ProfilesService.updateProfile` and
`AbidingsService.patchAbiding`. They throw `NotOwnerException`.

## Tests

- A unit controller spec never loads these guards, so it cannot reach a 401
  or a 403.
- `test/route-access.e2e-spec.ts` reads every route from the controllers and
  checks, over HTTP: 401 with no token on every route that is not public, and
  403 with the wrong role on every route limited to a role.
- `test/authorization.e2e-spec.ts` sends tokens someone has tampered with: a
  role written into the payload, another member's id, no signature, the wrong
  algorithm. It also demotes an admin and checks the same token gets 403.
- `test/passwords.e2e-spec.ts` and `test/password-reset.e2e-spec.ts` check
  that an older token is refused after the password changes.
- `test/rate-limit.e2e-spec.ts` covers the 429s.
