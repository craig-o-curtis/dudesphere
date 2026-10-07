import { Body, Controller, Post } from "@nestjs/common";

import { Public } from "../shared/decorators/public.decorator.js";
import { AuthService } from "./auth.service.js";
import { LoginUserDto } from "./dto/login-user.dto.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Public, and it has to be: this is the route that issues the token every
  // other route needs.
  @Public()
  @Post()
  login(@Body() loginUserDto: LoginUserDto) {
    return this.authService.login(loginUserDto);
  }
}
