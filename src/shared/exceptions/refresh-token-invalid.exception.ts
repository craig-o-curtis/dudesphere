import { UnauthorizedException } from "@nestjs/common";

import { ErrorCode } from "../error-codes.js";

/**
 * A refresh token cannot be swapped for new tokens. A 401 with
 * REFRESH_TOKEN_INVALID.
 *
 * One answer for every reason: the token is unknown, expired, already used,
 * or its session was ended. A client does the same thing in each case, which
 * is to send the member to sign in again. Telling the reasons apart would
 * only help someone trying tokens, or tell a thief that the theft was seen.
 */
export class RefreshTokenInvalidException extends UnauthorizedException {
  constructor() {
    super("Invalid or expired refresh token", { errorCode: ErrorCode.REFRESH_TOKEN_INVALID });
  }
}
