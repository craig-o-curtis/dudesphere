import { Body, Controller, Post } from "@nestjs/common";
import { minutes, Throttle } from "@nestjs/throttler";

import { Public } from "../shared/decorators/public.decorator.js";
import { CreateUserDto } from "../users/dto/create-user.dto.js";
import { AuthService } from "./auth.service.js";
import { ThrottleByAccount } from "./decorators/throttle-by-account.decorator.js";
import { ForgotPasswordDto } from "./dto/forgot-password.dto.js";
import { LoginDto } from "./dto/login.dto.js";
import { ResetPasswordDto } from "./dto/reset-password.dto.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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

  @Public()
  @Post("forgot-password")
  forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @Public()
  @Post("reset-password")
  resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }

  @Public()
  @Post("logout")
  logout() {
    return this.authService.logout();
  }
}
