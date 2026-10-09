import { ArgumentsHost, Catch, Logger } from "@nestjs/common";
import { QueryFailedError } from "typeorm";

import { ValueTakenException } from "../exceptions/value-taken.exception.js";
import { AllExceptionsFilter } from "./all-exceptions.filter.js";
import { databaseFault } from "./database-fault.js";
import { databaseUnavailable, isDatabaseUnreachable } from "./database-unavailable.js";
import { invalidValue, isBadValueState } from "./invalid-value.js";
import { QUERY_CANCELED, queryTimedOut } from "./query-timed-out.js";

/** Postgres unique_violation. */
export const UNIQUE_VIOLATION = "23505";

/**
 * Safety net for constraints the service layer did not check.
 *
 * A unique violation means two callers raced, or a service forgot a lookup.
 * Either way it is a conflict, not a server fault, so it becomes a 409.
 * A lost connection becomes a 503, the same answer MongoErrorFilter gives.
 * A value that does not fit its column becomes a 400: see invalid-value.ts
 * for which codes count and which do not.
 * A statement Postgres cancelled for running too long becomes a 408.
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
      this.logger.warn(
        `${this.requestLine(host)}: unique violation reached the database: ${exception.message}`,
      );
      super.catch(new ValueTakenException(undefined, { cause: exception }), host);
      return;
    }

    // The connection dropped while the query ran, or Postgres is shutting
    // down. The query was not wrong, and the same request may work when sent
    // again, so it is a 503 and not a 500.
    if (isDatabaseUnreachable(exception.driverError)) {
      super.catch(databaseUnavailable(exception), host);
      return;
    }

    // Postgres cancelled the statement because it passed statement_timeout.
    // The caller waited as long as a request is allowed to, so it is the same
    // 408 TimeoutInterceptor gives. Logged, because a query this slow needs
    // an index or a rewrite.
    if (code === QUERY_CANCELED) {
      this.logger.warn(
        `${this.requestLine(host)}: Postgres cancelled a query that ran past its time limit`,
      );
      super.catch(queryTimedOut(exception), host);
      return;
    }

    // Postgres refused a value: too long, not a date, not valid text. That is
    // the caller's mistake, so it is a 400. It is also ours: a DTO should have
    // stopped it first. The warning names the route so the missing rule can
    // be found and added.
    if (isBadValueState(code)) {
      this.logger.warn(
        `${this.requestLine(host)}: Postgres refused a value a DTO should have stopped ` +
          `(${code}): ${exception.message}`,
      );
      super.catch(invalidValue(exception), host);
      return;
    }

    // Not passed on as it is: see database-fault.ts for what the raw error
    // would put in the log.
    super.catch(databaseFault(exception), host);
  }
}
