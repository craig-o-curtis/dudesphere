import { ArgumentsHost, Catch, ConflictException, Logger } from "@nestjs/common";
import { Error as MongooseError, mongo } from "mongoose";

import { ErrorCode } from "../error-codes.js";
import { AllExceptionsFilter } from "./all-exceptions.filter.js";
import { databaseFault } from "./database-fault.js";
import { databaseUnavailable } from "./database-unavailable.js";
import { invalidValue } from "./invalid-value.js";

/** MongoDB duplicate key. */
export const DUPLICATE_KEY = 11000;

/**
 * The Mongo twin of QueryFailedFilter.
 *
 * A duplicate key is a race on a unique index, the same thing as Postgres
 * 23505 (duplicate key violation), so it becomes a 409. A network or server-selection error means
 * Mongo is unreachable, which is a 503: the same request may succeed when
 * sent again. Any other server error is a fault and stays a 500, logged
 * without the document the error carries.
 *
 * Two errors come from Mongoose itself, before anything reaches Mongo. A
 * ValidationError means a value broke a rule in a schema, and a CastError
 * means a value could not be turned into the type a path needs. Both are the
 * caller's value, so both become a 400, as a value Postgres refuses does.
 *
 * `mongo` is the driver namespace Mongoose re-exports, so the driver's error
 * classes are reachable without adding mongodb as a dependency.
 */
@Catch(
  mongo.MongoServerError,
  mongo.MongoNetworkError,
  mongo.MongoServerSelectionError,
  MongooseError.ValidationError,
  MongooseError.CastError,
)
export class MongoErrorFilter extends AllExceptionsFilter {
  private readonly logger = new Logger(MongoErrorFilter.name);

  override catch(exception: mongo.MongoError | MongooseError, host: ArgumentsHost): void {
    if (exception instanceof mongo.MongoServerError && exception.code === DUPLICATE_KEY) {
      // The driver message names the index and the value, so it is logged
      // rather than returned to the caller.
      this.logger.warn(
        `${this.requestLine(host)}: duplicate key reached Mongo: ${exception.message}`,
      );
      super.catch(
        new ConflictException("That value is already taken", {
          cause: exception,
          errorCode: ErrorCode.VALUE_TAKEN,
        }),
        host,
      );
      return;
    }

    if (
      exception instanceof mongo.MongoNetworkError ||
      exception instanceof mongo.MongoServerSelectionError
    ) {
      super.catch(databaseUnavailable(exception), host);
      return;
    }

    // The caller's mistake, so a 400. It is also ours: a DTO or a pipe should
    // have stopped the value before Mongoose saw it. The warning names the
    // route so the missing rule can be found and added. Only the message is
    // logged; the error object also carries the value itself.
    if (
      exception instanceof MongooseError.ValidationError ||
      exception instanceof MongooseError.CastError
    ) {
      this.logger.warn(
        `${this.requestLine(host)}: Mongoose refused a value a DTO should have stopped: ` +
          exception.message,
      );
      super.catch(invalidValue(exception), host);
      return;
    }

    // Not passed on as it is: a Mongo server error can hold the document it
    // refused, and the base filter would print it. See database-fault.ts.
    super.catch(databaseFault(exception), host);
  }
}
