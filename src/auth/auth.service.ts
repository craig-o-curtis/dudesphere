import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

import { ErrorCode } from "../shared/error-codes.js";
import { jwtPayloadFor } from "../shared/guards/auth-user.js";
import { CreateUserDto } from "../users/dto/create-user.dto.js";
import { UsersService } from "../users/users.service.js";
import { LoginDto } from "./dto/login.dto.js";

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async signup(signupDto: CreateUserDto) {
    // prevent dupes happens inside the usersService.createUser method
    return await this.usersService.createUser(signupDto);
  }

  async login(loginDto: LoginDto) {
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

    const token = await this.jwtService.signAsync(jwtPayloadFor(user));

    return { token, userId: user.id, name: user.username };
  }
}
