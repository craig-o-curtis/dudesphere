import { ArgumentsHost, Catch, Logger } from "@nestjs/common";
import { Error as MongooseError, mongo } from "mongoose";

import { DatabaseFaultException } from "../exceptions/database-fault.exception.js";
import { DatabaseUnavailableException } from "../exceptions/database-unavailable.exception.js";
import { InvalidValueException } from "../exceptions/invalid-value.exception.js";
import { TimeLimitExceededException } from "../exceptions/time-limit-exceeded.exception.js";
import { ValueTakenException } from "../exceptions/value-taken.exception.js";
import { AllExceptionsFilter } from "./all-exceptions.filter.js";

/** MongoDB duplicate key. */
export const DUPLICATE_KEY = 11000;

/** MongoDB MaxTimeMSExpired: what the server answers when an operation passes its limit. */
export const MAX_TIME_EXPIRED = 50;

/**
 * The Mongo twin of QueryFailedFilter.
 *
 * A duplicate key is a race on a unique index, the same thing as Postgres
 * 23505 (duplicate key violation), so it becomes a 409. A network or server-selection error means
 * Mongo is unreachable, which is a 503: the same request may succeed when
 * sent again. Any other server error is a fault and stays a 500, logged
 * without the document the error carries.
 *
 * An operation that ran past its time limit becomes a 408.
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
  mongo.MongoOperationTimeoutError,
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
      super.catch(new ValueTakenException(undefined, { cause: exception }), host);
      return;
    }

    if (
      exception instanceof mongo.MongoNetworkError ||
      exception instanceof mongo.MongoServerSelectionError
    ) {
      super.catch(new DatabaseUnavailableException(exception), host);
      return;
    }

    // The operation passed the driver's timeoutMS, or Mongo's own limit got
    // there first (code 50). The caller waited as long as a request is
    // allowed to, so it is the same 408 TimeoutInterceptor gives.
    if (
      exception instanceof mongo.MongoOperationTimeoutError ||
      (exception instanceof mongo.MongoServerError && exception.code === MAX_TIME_EXPIRED)
    ) {
      this.logger.warn(
        `${this.requestLine(host)}: Mongo gave up on an operation that ran past its time limit`,
      );
      super.catch(new TimeLimitExceededException(exception), host);
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
      super.catch(new InvalidValueException(exception), host);
      return;
    }

    // Not passed on as it is: a Mongo server error can hold the document it
    // refused, and the base filter would print it. See DatabaseFaultException.
    super.catch(new DatabaseFaultException(exception), host);
  }
}
