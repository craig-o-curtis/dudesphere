import { BadRequestException } from "@nestjs/common";

import { ErrorCode } from "../error-codes.js";

/**
 * A password reset link is wrong, already used, or expired. A 400.
 *
 * All three failures get the same answer. Telling them apart would leak
 * information to someone trying random tokens.
 */
export class ResetTokenInvalidException extends BadRequestException {
  constructor() {
    super("Invalid or expired link", { errorCode: ErrorCode.RESET_TOKEN_INVALID });
  }
}
