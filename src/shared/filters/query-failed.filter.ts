import { ArgumentsHost, Catch, ConflictException, Logger } from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import { QueryFailedError } from "typeorm";

/** Postgres unique_violation. */
export const UNIQUE_VIOLATION = "23505";

/**
 * Safety net for constraints the service layer did not check.
 *
 * A unique violation means two callers raced, or a service forgot a lookup.
 * Either way it is a conflict, not a server fault, so it becomes a 409.
 * Every other database error keeps falling through to a 500 — those are real
 * faults and hiding them would only delay the fix.
 */
@Catch(QueryFailedError)
export class QueryFailedFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(QueryFailedFilter.name);

  override catch(exception: QueryFailedError, host: ArgumentsHost): void {
    const { code } = exception as QueryFailedError & { code?: string };

    if (code === UNIQUE_VIOLATION) {
      // The driver message names the constraint and the conflicting value,
      // so it is logged rather than returned to the caller.
      this.logger.warn(`Unique violation reached the database: ${exception.message}`);
      super.catch(new ConflictException("That value is already taken"), host);
      return;
    }

    super.catch(exception, host);
  }
}
