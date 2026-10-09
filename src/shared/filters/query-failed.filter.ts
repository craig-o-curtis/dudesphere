import {
  ArgumentsHost,
  Catch,
  ConflictException,
  HttpStatus,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { QueryFailedError } from "typeorm";

import { ErrorCode } from "../error-codes.js";
import { AllExceptionsFilter } from "./all-exceptions.filter.js";
import { databaseUnavailable, isDatabaseUnreachable } from "./database-unavailable.js";

/** Postgres unique_violation. */
export const UNIQUE_VIOLATION = "23505";

/**
 * Safety net for constraints the service layer did not check.
 *
 * A unique violation means two callers raced, or a service forgot a lookup.
 * Either way it is a conflict, not a server fault, so it becomes a 409.
 * A lost connection becomes a 503, the same answer MongoErrorFilter gives.
 * Every other database error keeps falling through to a 500 — those are real
 * faults and hiding them would only delay the fix.
 *
 * Extends AllExceptionsFilter so the 500 path gets the same log line as
 * every other fault. That path never logs the query's parameters.
 */
@Catch(QueryFailedError)
export class QueryFailedFilter extends AllExceptionsFilter {
  private readonly logger = new Logger(QueryFailedFilter.name);

  override catch(exception: QueryFailedError, host: ArgumentsHost): void {
    const { code } = exception as QueryFailedError & { code?: string };

    if (code === UNIQUE_VIOLATION) {
      // The driver message names the constraint and the conflicting value,
      // so it is logged rather than returned to the caller.
      this.logger.warn(`Unique violation reached the database: ${exception.message}`);
      super.catch(
        new ConflictException("That value is already taken", {
          cause: exception,
          errorCode: ErrorCode.VALUE_TAKEN,
        }),
        host,
      );
      return;
    }

    // The connection dropped while the query ran, or Postgres is shutting
    // down. The query was not wrong, and the same request may work when sent
    // again, so it is a 503 and not a 500.
    if (isDatabaseUnreachable(exception.driverError)) {
      super.catch(databaseUnavailable(exception), host);
      return;
    }

    // Not passed on as it is. Base would print the whole QueryFailedError,
    // and that object carries the values the query ran with: for a user
    // insert, the email and the password hash. Wrapped, the fault is logged
    // as the context line plus the stack, which names the driver message and
    // nothing else. The body is the one Base writes for any unknown error.
    super.catch(
      new InternalServerErrorException(
        { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: "Internal server error" },
        { cause: exception },
      ),
      host,
    );
  }
}
