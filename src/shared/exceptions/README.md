# NestJS Custom Exceptions

## TLDR description

Nest ships an exception class for each common HTTP status, such as
`NotFoundException` and `ConflictException`. A custom exception is a class of
your own that extends one of them. It gives one kind of failure a name, and
fixes its status, its wording and its error code in one place.

```ts
// Without a class: every place that throws it repeats the pairing.
throw new ForbiddenException("Not authorized to edit this abiding", {
  errorCode: ErrorCode.NOT_OWNER,
});

// With a class: the throw names the failure, and nothing else.
throw new NotOwnerException("Not authorized to edit this abiding");
```

A custom exception is still its built-in parent. Nest answers it the same
way, with the same body, and no filter has to know about it.

The full lesson, with how to write and test one, is in
`reference/NESTJS_CUSTOM_EXCEPTIONS.md`.

## When a failure gets a class here

A failure gets its own class when either of these is true:

- **It is thrown from more than one place.** One class keeps the status and
  the code from drifting apart between those places.
- **Which failure to throw is worked out from data.** `ValueTakenException`
  is the example: the field that collided decides the wording and the code.

Everything else keeps a built-in class, with an `errorCode` where a client
would branch. That covers most of the app: a `NotFoundException` with its own
message, or the login 401 with `BAD_CREDENTIALS`, is thrown from one place and
needs no class.

Do not add a class just to have one. A class that fits neither rule is one
more file to keep in step with the code.

## In this folder

| Class                          | Extends                        | Status | Error code                                     |
| ------------------------------ | ------------------------------ | ------ | ---------------------------------------------- |
| `ValueTakenException`          | `ConflictException`            | 409    | `EMAIL_TAKEN`, `USERNAME_TAKEN`, `VALUE_TAKEN` |
| `NotOwnerException`            | `ForbiddenException`           | 403    | `NOT_OWNER`                                    |
| `TokenMissingException`        | `UnauthorizedException`        | 401    | `TOKEN_MISSING`                                |
| `DatabaseUnavailableException` | `ServiceUnavailableException`  | 503    | `DATABASE_UNAVAILABLE`                         |
| `InvalidValueException`        | `BadRequestException`          | 400    | none                                           |
| `TimeLimitExceededException`   | `RequestTimeoutException`      | 408    | none                                           |
| `DatabaseFaultException`       | `InternalServerErrorException` | 500    | none                                           |

Who throws each one:

- `ValueTakenException`: `UsersService`, when its own lookup finds the email
  or username in use, and both database filters, when a unique index refuses
  a write. Pass `"email"` or `"username"` when you know the field. Pass no
  field when you do not, and the answer is the general `VALUE_TAKEN`.
- `NotOwnerException`: `AbidingsService` and `ProfilesService`, when the thing
  exists and is someone else's. Each passes its own message.
- `TokenMissingException`: `JwtAuthGuard` and `RolesGuard`.
- `DatabaseUnavailableException`: all three exception filters.
- `InvalidValueException`, `DatabaseFaultException`: both database filters.
- `TimeLimitExceededException`: both database filters and `TimeoutInterceptor`.

The four the filters throw take the driver's error as their one argument and
keep it as `cause`. `AllExceptionsFilter` logs a cause; it is never returned.

`exceptions.spec.ts` holds one table for all seven. Each row pins the status,
the whole body and the error code.

## One code that has no class

`CLOCK_UNAVAILABLE` is thrown from two places, so by the rule it would get a
class. It does not, because it is temporary: the note in `../error-codes.ts`
says when it goes away.

## Where they are used

Anywhere a request can fail: a service, a guard, an interceptor or a filter.
Import the class and throw it. Nothing is registered.

The error codes themselves live in `../error-codes.ts`. The filters that
decide when a database error becomes one of these are in `../filters/`.
