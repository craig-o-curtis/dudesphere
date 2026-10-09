# NestJS built-in HTTP exceptions

## TLDR description

Nest ships 21 exception classes in `@nestjs/common`. Each one stands for one
HTTP status code. Throw one anywhere in a request, and Nest answers with that
status and a JSON body. You write no filter and no `res.status(...)` call.

All 21 extend `HttpException`.

## The status code behind each class

Checked against `@nestjs/common` 12.0.4, the version this repo installs.

| Code | Exception                          | What it tells the caller                                |
| ---- | ---------------------------------- | ------------------------------------------------------- |
| 400  | `BadRequestException`              | The request is malformed or fails validation.           |
| 401  | `UnauthorizedException`            | You have not proved who you are.                        |
| 403  | `ForbiddenException`               | We know who you are, and you may not do this.           |
| 404  | `NotFoundException`                | Nothing exists at this URL or id.                       |
| 405  | `MethodNotAllowedException`        | The URL exists, but not for this HTTP method.           |
| 406  | `NotAcceptableException`           | The server cannot send the format `Accept` asks for.    |
| 408  | `RequestTimeoutException`          | The request took too long.                              |
| 409  | `ConflictException`                | The request clashes with stored data, e.g. a duplicate. |
| 410  | `GoneException`                    | It was here once and was removed for good.              |
| 412  | `PreconditionFailedException`      | A condition header such as `If-Match` did not hold.     |
| 413  | `PayloadTooLargeException`         | The body is bigger than the server accepts.             |
| 415  | `UnsupportedMediaTypeException`    | The server does not read this `Content-Type`.           |
| 418  | `ImATeapotException`               | A joke status from RFC 2324. Not for real errors.       |
| 421  | `MisdirectedException`             | The request reached the wrong server for that host.     |
| 422  | `UnprocessableEntityException`     | The body parses, but its contents break a rule.         |
| 500  | `InternalServerErrorException`     | The server failed. The caller did nothing wrong.        |
| 501  | `NotImplementedException`          | The server does not support this yet.                   |
| 502  | `BadGatewayException`              | A server behind this one gave a bad answer.             |
| 503  | `ServiceUnavailableException`      | The server cannot answer right now. Try again later.    |
| 504  | `GatewayTimeoutException`          | A server behind this one did not answer in time.        |
| 505  | `HttpVersionNotSupportedException` | The server does not speak the request's HTTP version.   |

A 4xx code says the caller must change the request. A 5xx code says the server
must be fixed or given time.

## The eight this app throws

`BadRequestException` (400), `UnauthorizedException` (401),
`ForbiddenException` (403), `NotFoundException` (404),
`RequestTimeoutException` (408), `ConflictException` (409),
`InternalServerErrorException` (500) and `ServiceUnavailableException` (503).

Learn these eight first. The other 13 are rare in a JSON API.

## How to throw one

Every class takes the same two optional arguments: a message, then an options
object.

**EXISTING FILE:** the lookup by id in the abidings service.

```ts
// src/abidings/abidings.service.ts
throw new NotFoundException("Abiding not found");
```

Nest answers with status 404 and this body:

```json
{
  "message": "Abiding not found",
  "error": "Not Found",
  "statusCode": 404
}
```

`message` is your text. `error` is the standard name of the status. Leave the
message out and Nest drops `error` and puts the standard name in `message`.

The options object takes three keys:

- `errorCode` is a fixed string a client can switch on. Nest adds it to the
  body.
- `description` replaces the text in `error`.
- `cause` is the original error. Nest never sends it to the caller. This app's
  catch-all filter logs its stack for a 5xx.

**EXISTING FILE:** the roles guard, with an `errorCode`.

```ts
// src/shared/guards/roles.guard.ts
throw new ForbiddenException("Not authorized to perform this action", {
  errorCode: ErrorCode.ROLE_REQUIRED,
});
```

```json
{
  "message": "Not authorized to perform this action",
  "error": "Forbidden",
  "statusCode": 403,
  "errorCode": "ROLE_REQUIRED"
}
```

## A status with no class

Some codes have no class, such as 429 Too Many Requests. Use the base class
with the `HttpStatus` enum:

```ts
throw new HttpException("Slow down", HttpStatus.TOO_MANY_REQUESTS);
```

## This app's own exception classes

You can extend a built-in class to give one kind of failure a name. The class
fixes its status, its wording and its error code in one place.

**EXISTING FILE:** the failure for "this is someone else's".

```ts
// src/shared/exceptions/not-owner.exception.ts
export class NotOwnerException extends ForbiddenException {
  constructor(message: string) {
    super(message, { errorCode: ErrorCode.NOT_OWNER });
  }
}
```

**EXISTING FILE:** a service that throws it.

```ts
// src/abidings/abidings.service.ts
throw new NotOwnerException("Not authorized to edit this abiding");
```

Nest answers it exactly as it would a `ForbiddenException` built by hand. The
class needs no filter and is registered nowhere.

This app has seven. A failure gets a class only when it is thrown from more
than one place, or when which failure to throw is worked out from data. The
rest use a built-in class. The list and the rule are in
[src/shared/exceptions/README.md](../src/shared/exceptions/README.md).

## Where filters come in

These exceptions need no filter. A filter is for an error that is not an
`HttpException`, such as one a database driver throws. See
[src/shared/filters/README.md](../src/shared/filters/README.md).

Docs: <https://docs.nestjs.com/exception-filters#built-in-http-exceptions>
