import { ServiceUnavailableException } from "@nestjs/common";

import { ErrorCode } from "../error-codes.js";

/**
 * The current time could not be read. A 503 with CLOCK_UNAVAILABLE.
 *
 * gmt's getUtcNow() documents "" as its result when the clock fails, and its
 * arithmetic returns "" for an input it cannot use. Every caller that is
 * about to write or compare a time checks for that and throws this, so a
 * blank timestamp never reaches a database.
 *
 * Temporary. See CLOCK_UNAVAILABLE in ../error-codes.ts.
 */
export class ClockUnavailableException extends ServiceUnavailableException {
  constructor() {
    super("Could not read the current UTC time", { errorCode: ErrorCode.CLOCK_UNAVAILABLE });
  }
}
