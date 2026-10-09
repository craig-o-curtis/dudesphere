import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

import { ErrorCode } from "../shared/error-codes.js";
import { UsersService } from "../users/users.service.js";
import type { JwtPayload } from "./auth-user.js";
import { LoginUserDto } from "./dto/login-user.dto.js";

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async login(loginUser: LoginUserDto) {
    const user = await this.usersService.getUserByCredentials(loginUser.email, loginUser.password);

    // One message for both cases, so the response doesn't reveal which
    // emails have an account.
    if (!user) {
      throw new UnauthorizedException("Invalid email or password", {
        errorCode: ErrorCode.BAD_CREDENTIALS,
      });
    }

    const payload: JwtPayload = { sub: user.id, username: user.username, role: user.role };
    const token = await this.jwtService.signAsync(payload);

    return { token, userId: user.id, name: user.username };
  }
}
