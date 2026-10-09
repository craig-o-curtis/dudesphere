import { ServiceUnavailableException } from "@nestjs/common";

import { ErrorCode } from "../error-codes.js";

/**
 * A database cannot be reached. A 503 with DATABASE_UNAVAILABLE.
 *
 * All three exception filters answer with this one class, so a caller sees
 * the same body whichever database is down, and however its driver reported
 * it. The same request may work when sent again, which is what a 503 says.
 *
 * Pass the driver error as the cause. AllExceptionsFilter logs it; it is
 * never returned.
 */
export class DatabaseUnavailableException extends ServiceUnavailableException {
  constructor(cause: unknown) {
    super("Database unavailable", { cause, errorCode: ErrorCode.DATABASE_UNAVAILABLE });
  }
}
