import { HttpStatus, InternalServerErrorException } from "@nestjs/common";

/**
 * The plain 500 for a database error that is a real fault: not a conflict,
 * not an outage, not a bad value.
 *
 * A database filter must not hand the raw driver error to Nest's base filter.
 * The base filter prints the whole object, and a driver error carries data:
 * a TypeORM QueryFailedError holds the values its query ran with (for a user
 * insert, the email and the password hash), and a Mongo server error can
 * hold the document it refused. Wrapped like this, the error rides along as
 * `cause`, and AllExceptionsFilter logs the request and the stack only.
 *
 * The body is the one the base filter writes for any unknown error.
 */
export function databaseFault(cause: unknown): InternalServerErrorException {
  return new InternalServerErrorException(
    { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: "Internal server error" },
    { cause },
  );
}
