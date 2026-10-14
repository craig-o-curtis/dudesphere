import { PasswordResetService, Public } from "@nestjs/authentication";
import { BadRequestException, Body, Controller, HttpCode, Post } from "@nestjs/common";
import { minutes, Throttle } from "@nestjs/throttler";

import { ErrorCode } from "../shared/error-codes.js";
import { EmailDto, ResetPasswordDto } from "./auth.dto.js";

/**
 * The docs' PasswordResetController, from "Reset forgotten passwords" on
 * https://docs.nestjs.com/security/authentication. PasswordResetMailer is
 * the app's half of it.
 */
@Public()
@Controller("auth/password")
export class PasswordResetController {
  constructor(private readonly passwordResetService: PasswordResetService) {}

  // The same answer, as fast, whether or not the address has an account:
  // request() returns before it looks the address up. A failure after the
  // answer, such as a mail server that is down, is logged by the package.
  //
  // 3 tries in 15 minutes for one address from one IP address, so nobody can
  // flood a member's inbox.
  @Throttle({ default: { limit: 3, ttl: minutes(15) } })
  @Post("forgot")
  @HttpCode(202)
  forgot(@Body() body: EmailDto): void {
    this.passwordResetService.request(body.email);
  }

  // Called by the page the link opens, with the token from its URL and the
  // new password. It ends every sign-in of the member.
  //
  // 204, where the docs answer 200: the docs also sign the browser in with a
  // cookie and say whether a second factor is needed. This API does neither,
  // so there is nothing to answer with. The member signs in at
  // POST /auth/token.
  @Post("reset")
  @HttpCode(204)
  async reset(@Body() body: ResetPasswordDto): Promise<void> {
    const result = await this.passwordResetService.reset(body.token, body.password);
    if (!result) {
      throw new BadRequestException("Invalid or expired link", {
        errorCode: ErrorCode.RESET_TOKEN_INVALID,
      });
    }
  }
}
