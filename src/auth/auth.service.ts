import { Injectable, UnauthorizedException } from "@nestjs/common";

import { ErrorCode } from "../shared/error-codes.js";
import { CreateUserDto } from "../users/dto/create-user.dto.js";
import { UserResponseDto } from "../users/dto/user-response.dto.js";
import { UsersService } from "../users/users.service.js";
import { LoginDto } from "./dto/login.dto.js";

@Injectable()
export class AuthService {
  constructor(private readonly usersService: UsersService) {}

  async signup(signupDto: CreateUserDto) {
    // prevent dupes happens inside the usersService.createUser method
    return await this.usersService.createUser(signupDto);
  }

  // The first half of signing in: is this the member, and is that their
  // password? Returns the member, or throws a 401. TokensController hands the
  // member to TokenService, which makes the tokens.
  async verifyCredentials(loginDto: LoginDto): Promise<UserResponseDto> {
    const user = await this.usersService.getUserByCredentials(
      loginDto.identifier,
      loginDto.password,
    );

    // One message for every case, so the response doesn't reveal which
    // usernames and emails have an account.
    if (!user) {
      throw new UnauthorizedException("Invalid username, email or password", {
        errorCode: ErrorCode.BAD_CREDENTIALS,
      });
    }

    return user;
  }
}
