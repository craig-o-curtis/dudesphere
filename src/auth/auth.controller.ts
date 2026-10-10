import { Body, Controller, Post } from "@nestjs/common";

import { Public } from "../shared/decorators/public.decorator.js";
import { CreateUserDto } from "../users/dto/create-user.dto.js";
import { AuthService } from "./auth.service.js";
import { ForgotPasswordDto } from "./dto/forgot-password.dto.js";
import { LoginUserDto } from "./dto/login-user.dto.js";
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
  @Public()
  @Post("login")
  login(@Body() loginUserDto: LoginUserDto) {
    return this.authService.login(loginUserDto);
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
