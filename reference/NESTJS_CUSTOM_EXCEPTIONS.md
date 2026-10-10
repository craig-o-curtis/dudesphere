# NestJS custom exceptions

## TLDR description

A custom exception is a class of your own that extends one of Nest's built-in
HTTP exceptions. It gives one kind of failure a name, and fixes its status,
its wording and its error code in one place.

Nest answers a custom exception exactly as it answers its parent. You write
no filter for it and register it nowhere.

[NESTJS_EXCEPTIONS.md](NESTJS_EXCEPTIONS.md) covers the built-in classes.
This lesson covers the ones this app adds on top.

## The problem a class solves

Without a class, every place that throws the failure repeats how it is built.

**BEFORE:** how this throw was written until the class existed.

```ts
// src/abidings/abidings.service.ts
throw new ForbiddenException("Not authorized to edit this abiding", {
  errorCode: ErrorCode.NOT_OWNER,
});
```

Three places throw "not the owner". Each one has to remember that it is a
403 and that its code is `NOT_OWNER`. Nothing stops a fourth from pairing the
code with a different status.

With a class, the throw names the failure and nothing else.

**EXISTING FILE:** the same throw today.

```ts
// src/abidings/abidings.service.ts
throw new NotOwnerException("Not authorized to edit this abiding");
```

## How to write one

**EXISTING FILE:** the whole class, comments left out.

```ts
// src/shared/exceptions/not-owner.exception.ts
export class NotOwnerException extends ForbiddenException {
  constructor(message: string) {
    super(message, { errorCode: ErrorCode.NOT_OWNER });
  }
}
```

1. **Extend the built-in class for the status.** `ForbiddenException` makes
   this a 403. The class never mentions the number.
2. **Take only what changes from one throw to the next.** Here that is the
   message. The error code never changes, so the caller does not pass it.
3. **Hand the rest to `super`.** The parent builds the body.

## What extending changes, and what it does not

Checked on `@nestjs/common` 12.0.4 by building a `NotOwnerException` and the
same `ForbiddenException` by hand, and comparing the two.

|                                         | Built by hand        | The class           |
| --------------------------------------- | -------------------- | ------------------- |
| Status                                  | 403                  | 403                 |
| Body                                    | The same             | The same            |
| `errorCode`                             | `NOT_OWNER`          | `NOT_OWNER`         |
| `instanceof ForbiddenException`         | Yes                  | Yes                 |
| `instanceof HttpException`              | Yes                  | Yes                 |
| `name`, and the first line of the stack | `ForbiddenException` | `NotOwnerException` |

The body both of them send:

```json
{
  "message": "Not authorized to edit this abiding",
  "error": "Forbidden",
  "statusCode": 403,
  "errorCode": "NOT_OWNER"
}
```

So a caller cannot tell which one was thrown. Only the name differs, and the
name shows up in a stack trace, which makes a log easier to read.

Because the class is still its parent, a filter written with
`@Catch(ForbiddenException)` catches it too.

## When a failure gets a class

A failure gets its own class when either of these is true:

- **It is thrown from more than one place.** One class keeps the status and
  the code from drifting apart between those places.
- **Which failure to throw is worked out from data.** The class then holds the
  choice, and the throw site does not.

Everything else keeps a built-in class. Most throws in this app are like
that: a `NotFoundException` with its own message is thrown from one place, and
a class for it would only be one more file to keep in step.

## The seven in this app

All in [src/shared/exceptions/](../src/shared/exceptions/README.md).

| Class                          | Status | Error code                                     | You pass          |
| ------------------------------ | ------ | ---------------------------------------------- | ----------------- |
| `ValueTakenException`          | 409    | `EMAIL_TAKEN`, `USERNAME_TAKEN`, `VALUE_TAKEN` | The field, if any |
| `NotOwnerException`            | 403    | `NOT_OWNER`                                    | The message       |
| `TokenMissingException`        | 401    | `TOKEN_MISSING`                                | The message       |
| `DatabaseUnavailableException` | 503    | `DATABASE_UNAVAILABLE`                         | The cause         |
| `InvalidValueException`        | 400    | None                                           | The cause         |
| `TimeLimitExceededException`   | 408    | None                                           | The cause         |
| `DatabaseFaultException`       | 500    | None                                           | The cause         |

The last column sorts them into three kinds. Each kind is shown below.

## Kind 1: you pass the message

`NotOwnerException` and `TokenMissingException`. The failure is always the
same, but each place describes it in its own words: "edit this abiding",
"delete this abiding", "edit this profile".

**EXISTING FILE:** one of the three places that throw it.

```ts
// src/profiles/profiles.service.ts
throw new NotOwnerException("Not authorized to edit this profile");
```

## Kind 2: you pass the cause

The four that the exception filters throw. Their wording never changes, so
the only thing to hand over is the error that set them off.

**EXISTING FILE:** the Postgres filter, when the connection was lost.

```ts
// src/shared/filters/pg-error.filter.ts
super.catch(new DatabaseUnavailableException(exception), host);
```

The class keeps that error as `cause`. Nest never sends a cause to the
caller, so the driver's own message cannot reach the response. It still
reaches the log: for a 5xx the catch-all filter logs the cause's stack, and
for the others the filter that throws the class logs a warning first.

A filter is still needed here. A database driver throws its own error
classes, which are not `HttpException`s, and only a filter can turn one into
an answer. The custom exception is what the filter turns it into.
[DATABASE_ERROR_CODES.md](DATABASE_ERROR_CODES.md) lists which driver error
becomes which class.

## Kind 3: the class works the answer out

`ValueTakenException` is the only one. Which field collided decides both the
wording and the code, and that choice lives in the class.

**EXISTING FILE:** the class, comments left out.

```ts
// src/shared/exceptions/value-taken.exception.ts
export type TakenField = "email" | "username";

const BY_FIELD: Record<TakenField, { message: string; errorCode: ErrorCode }> = {
  email: { message: "Email already registered", errorCode: ErrorCode.EMAIL_TAKEN },
  username: { message: "Username already taken", errorCode: ErrorCode.USERNAME_TAKEN },
};

const FIELD_UNKNOWN = {
  message: "That value is already taken",
  errorCode: ErrorCode.VALUE_TAKEN,
};

export class ValueTakenException extends ConflictException {
  constructor(field?: TakenField, options: { cause?: unknown } = {}) {
    const { message, errorCode } = field ? BY_FIELD[field] : FIELD_UNKNOWN;
    super(message, { cause: options.cause, errorCode });
  }
}
```

It is thrown two ways.

**EXISTING FILE:** a service that looked the value up, so it knows the field.

```ts
// src/users/users.service.ts
throw new ValueTakenException(takenField(existing, createUserDto));
```

**EXISTING FILE:** a filter that caught a unique index refusing the write. It
does not know the field, so it passes none and gets the general answer.

```ts
// src/shared/filters/pg-error.filter.ts
super.catch(new ValueTakenException(undefined, { cause: exception }), host);
```

Before this class existed, a helper returned a message and a code, and each
caller built the exception from them. The helper now returns only `"email"`
or `"username"`. Working out the field is its job. Knowing what to say about
it is the class's.

## Traps

- **A string and an object mean different things to `super`.** A string
  becomes `message`, and Nest adds `error` and `statusCode` around it. An
  object replaces the whole body. `DatabaseFaultException` passes an object
  on purpose, so its body is exactly the one Nest writes for an unknown
  error:

  ```ts
  // src/shared/exceptions/database-fault.exception.ts
  super(
    { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: "Internal server error" },
    { cause },
  );
  ```

  That sends `{ "statusCode": 500, "message": "Internal server error" }`. The
  string form would add `"error": "Internal Server Error"`.

- **A cause is for the log, never the caller.** Put the original error in
  `cause` and nothing from it in the message. A driver's message can quote the
  value it refused.
- **Do not catch an error only to rethrow it as a class.** In a service, let
  a database error escape. A transaction needs it to roll back, and the
  filters already turn it into the right class.
- **A class is not for every throw.** If only one place throws it and nothing
  about it is worked out, use the built-in class.
- **Throw the class, not the code.** For `NOT_OWNER`, `TOKEN_MISSING`,
  `DATABASE_UNAVAILABLE` and the three `_TAKEN` codes, building the exception
  by hand skips the one place that pairs the code with its status.

## How to test one

Test the answer, because the answer is all a class of this kind is.

**EXISTING FILE:** one row of the table that covers all seven.

```ts
// src/shared/exceptions/exceptions.spec.ts
[
  "NotOwnerException",
  () => new NotOwnerException("Not authorized to edit this abiding"),
  {
    parent: ForbiddenException,
    status: 403,
    body: {
      statusCode: 403,
      message: "Not authorized to edit this abiding",
      error: "Forbidden",
      errorCode: "NOT_OWNER",
    },
    errorCode: "NOT_OWNER",
  },
],
```

Each row is checked four ways: the status and the whole body, the error code,
that the class is still an instance of its parent, and that a cause is kept
and never appears in the body.

Where the class is thrown, assert the class and the code's literal text:

**EXISTING FILE:** a service spec.

```ts
// src/profiles/profiles.service.spec.ts
await expect(attempt).rejects.toBeInstanceOf(NotOwnerException);
await expect(attempt).rejects.toMatchObject({ errorCode: "NOT_OWNER" });
```

The second line uses the string `"NOT_OWNER"`, not `ErrorCode.NOT_OWNER`. A
client depends on that exact text, so renaming the code has to fail a test.

## A status with no built-in class

Every class above extends a built-in. For a status that has none, such as 429
Too Many Requests, extend `HttpException` and give it the status yourself.

**NEW FILE:** what such a class would look like. This app has none yet.

```ts
// src/shared/exceptions/too-many-requests.exception.ts
export class TooManyRequestsException extends HttpException {
  constructor() {
    super("Slow down", HttpStatus.TOO_MANY_REQUESTS);
  }
}
```

Nest then answers with status 429 and `{ "statusCode": 429, "message": "Slow down" }`.

## One code that has no class

`CLOCK_UNAVAILABLE` is thrown from two places, so by the rule it would get a
class. It does not, because it is temporary. The note in
[src/shared/error-codes.ts](../src/shared/error-codes.ts) says when it goes
away.

## Where the code lives

- [src/shared/exceptions/](../src/shared/exceptions/README.md) holds the seven
  classes and the spec.
- [src/shared/error-codes.ts](../src/shared/error-codes.ts) holds the codes.
- [src/shared/filters/](../src/shared/filters/README.md) holds the filters
  that throw four of them.

Docs: <https://docs.nestjs.com/exception-filters#custom-exceptions>
