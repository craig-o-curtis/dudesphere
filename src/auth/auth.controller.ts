import { Public } from "@nestjs/authentication";
import { Body, Controller, Post } from "@nestjs/common";

import { CreateUserDto } from "../users/dto/create-user.dto.js";
import { UserResponseDto } from "../users/dto/user-response.dto.js";
import { UsersService } from "../users/users.service.js";

/**
 * Sign-up. The docs' AuthController also signs the new member in with a
 * session cookie, and has POST /auth/sign-in for browsers. This API hands
 * out bearer tokens only, so a new member signs in at POST /auth/token.
 */
@Public()
@Controller("auth")
export class AuthController {
  constructor(private readonly usersService: UsersService) {}

  // 201, the default for POST: a member is created. The answer is the new
  // member, without the password. A taken email, username or display name is
  // a 409 from UsersService.createUser.
  @Post("sign-up")
  signUp(@Body() body: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.createUser(body);
  }
}
