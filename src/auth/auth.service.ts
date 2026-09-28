import { Injectable } from "@nestjs/common";

import { UsersService } from "../users/users.service.js";
import { AuthStateService } from "./auth-state.service.js";
import { LoginUserDto } from "./dto/login-user.dto.js";

@Injectable()
export class AuthService {
  constructor(
    private readonly authStateService: AuthStateService,
    private readonly usersService: UsersService,
  ) {}

  get isAuthenticated(): boolean {
    return this.authStateService.isAuthenticated;
  }

  async login(loginUser: LoginUserDto) {
    const user = await this.usersService.getUserByEmail(loginUser.email);

    if (user) {
      this.authStateService.isAuthenticated = true;
      return { token: "MY_TOKEN", userId: user.id, name: user.username };
    }
    throw new Error("User does not exist");
  }

  validateToken(token: string): { userId: number; name: string } | null {
    if (token === "MY_TOKEN") {
      return { userId: 1, name: "Demo User" };
    }
    return null;
  }
}
