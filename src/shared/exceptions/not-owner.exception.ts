import { ForbiddenException } from "@nestjs/common";

import { ErrorCode } from "../error-codes.js";

/**
 * The caller is signed in and the thing exists, but it is not theirs to
 * change. A 403 with NOT_OWNER.
 *
 * The message says what they tried to do, such as "Not authorized to edit
 * this abiding", so each place that throws this passes its own.
 *
 * Throw it only once you know the thing exists. A missing one is a 404, even
 * for a caller who would not have owned it: a 403 there would tell them which
 * ids are real.
 */
export class NotOwnerException extends ForbiddenException {
  constructor(message: string) {
    super(message, { errorCode: ErrorCode.NOT_OWNER });
  }
}
