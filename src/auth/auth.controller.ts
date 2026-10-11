import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { minutes, Throttle } from "@nestjs/throttler";

import { Public } from "../shared/decorators/public.decorator.js";
import { CreateUserDto } from "../users/dto/create-user.dto.js";
import { AuthService } from "./auth.service.js";
import { ThrottleByAccount } from "./decorators/throttle-by-account.decorator.js";
import { ForgotPasswordDto } from "./dto/forgot-password.dto.js";
import { LoginDto } from "./dto/login.dto.js";
import { ResetPasswordDto } from "./dto/reset-password.dto.js";
import { PasswordResetService } from "./password-reset.service.js";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordResetService: PasswordResetService,
  ) {}

  @Public()
  @Post("signup")
  signup(@Body() signupDto: CreateUserDto) {
    return this.authService.signup(signupDto);
  }

  // Public, and it has to be: this is the route that issues the token every
  // other route needs.
  //
  // 5 tries in 15 minutes for one account from one IP address, right or
  // wrong. That is slow enough to make guessing a password pointless, and a
  // person who mistypes theirs a few times is not shut out for long. The
  // sixth gets a 429 with a Retry-After header.
  @Public()
  @ThrottleByAccount("identifier")
  @Throttle({ default: { limit: 5, ttl: minutes(15) } })
  @Post("login")
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  // 202 Accepted, with no body, every time. The work is started and not
  // waited for, so the answer is the same, and as fast, whether or not the
  // address has an account. Nobody can use this route to find out which
  // emails are registered. requestEmail() never rejects, so `void` drops
  // nothing.
  //
  // 3 in 15 minutes for one address from one IP, which also keeps anyone from
  // flooding a member's inbox.
  @Public()
  @ThrottleByAccount("email")
  @Throttle({ default: { limit: 3, ttl: minutes(15) } })
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
  @Public()
  @Post("reset-password")
  @HttpCode(204)
  resetPassword(@Body() { token, password }: ResetPasswordDto): Promise<void> {
    return this.passwordResetService.reset(token, password);
  }
}
