import { UnauthorizedException } from "@nestjs/common";

import { ErrorCode } from "../error-codes.js";

/**
 * The request needs a signed-in caller and carries no token. A 401 with
 * TOKEN_MISSING.
 *
 * A token that is present but wrong is a different failure, TOKEN_INVALID.
 * A client treats the two differently: with no token it sends the user to
 * sign in, and with a bad one it first tries to get a fresh one.
 */
export class TokenMissingException extends UnauthorizedException {
  constructor(message: string) {
    super(message, { errorCode: ErrorCode.TOKEN_MISSING });
  }
}
