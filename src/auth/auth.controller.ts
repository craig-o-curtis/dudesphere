import { Body, Controller, Post } from "@nestjs/common";

import { AuthService } from "./auth.service.js";
import { LoginUserDto } from "./dto/login-user.dto.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post()
  login(@Body() loginUserDto: LoginUserDto) {
    return this.authService.login(loginUserDto);
  }
}
