import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { minutes } from "@nestjs/throttler";

import { Public } from "../shared/guards/public.decorator.js";
import { ThrottleByAccount } from "../shared/guards/throttle-by-account.decorator.js";
import { CreateUserDto } from "../users/dto/create-user.dto.js";
import { AuthService } from "./auth.service.js";
import { ForgotPasswordDto } from "./dto/forgot-password.dto.js";
import { ResetPasswordDto } from "./dto/reset-password.dto.js";
import { PasswordResetService } from "./password-reset.service.js";

// Sign up and the forgotten-password routes. Signing in, and everything else
// to do with tokens, is in TokensController.
@Public()
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordResetService: PasswordResetService,
  ) {}

  @Post("signup")
  signup(@Body() signupDto: CreateUserDto) {
    return this.authService.signup(signupDto);
  }

  // 202 Accepted, with no body, every time. The work is started and not
  // waited for, so the answer is the same, and as fast, whether or not the
  // address has an account. Nobody can use this route to find out which
  // emails are registered. requestEmail() never rejects, so `void` drops
  // nothing.
  //
  // 3 in 15 minutes for one email from one IP address, which also keeps
  // anyone from flooding a member's inbox. The 100 a minute by IP address
  // alone counts here too, however many emails a caller names.
  @ThrottleByAccount("email", { limit: 3, ttl: minutes(15) })
  @Post("forgot-password")
  @HttpCode(202)
  forgotPassword(@Body() { email }: ForgotPasswordDto): void {
    void this.passwordResetService.requestEmail(email);
  }

  // Called by the page the emailed link opens, with the token from its URL
  // and the new password. 204: the password is changed and there is nothing
  // to send back. The member then logs in with it.
  //
  // No limit of its own. A guessed token costs one lookup, and there are
  // 2^256 of them.
  @Post("reset-password")
  @HttpCode(204)
  resetPassword(@Body() { token, password }: ResetPasswordDto): Promise<void> {
    return this.passwordResetService.reset(token, password);
  }
}
