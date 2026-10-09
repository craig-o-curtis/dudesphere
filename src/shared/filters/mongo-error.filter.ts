import {
  ArgumentsHost,
  Catch,
  ConflictException,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { mongo } from "mongoose";

import { ErrorCode } from "../error-codes.js";
import { AllExceptionsFilter } from "./all-exceptions.filter.js";

/** MongoDB duplicate key. */
export const DUPLICATE_KEY = 11000;

/**
 * The Mongo twin of QueryFailedFilter.
 *
 * A duplicate key is a race on a unique index, the same thing as Postgres
 * 23505 (duplicate key violation), so it becomes a 409. A network or server-selection error means
 * Mongo is unreachable, which is a 503: the same request may succeed when
 * sent again. Any other server error is a fault and stays a 500.
 *
 * `mongo` is the driver namespace Mongoose re-exports, so the driver's error
 * classes are reachable without adding mongodb as a dependency.
 */
@Catch(mongo.MongoServerError, mongo.MongoNetworkError, mongo.MongoServerSelectionError)
export class MongoErrorFilter extends AllExceptionsFilter {
  private readonly logger = new Logger(MongoErrorFilter.name);

  override catch(exception: mongo.MongoError, host: ArgumentsHost): void {
    if (exception instanceof mongo.MongoServerError && exception.code === DUPLICATE_KEY) {
      // The driver message names the index and the value, so it is logged
      // rather than returned to the caller.
      this.logger.warn(`Duplicate key reached Mongo: ${exception.message}`);
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
      super.catch(
        new ServiceUnavailableException("Database unavailable", {
          cause: exception,
          errorCode: ErrorCode.DATABASE_UNAVAILABLE,
        }),
        host,
      );
      return;
    }

    super.catch(exception, host);
  }
}
