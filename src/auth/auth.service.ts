import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { UserEntity } from "../users/users.entity.js";
import { AuthStateService } from "./auth-state.service.js";
import { LoginUserDto } from "./dto/login-user.dto.js";

@Injectable()
export class AuthService {
  constructor(
    private readonly authStateService: AuthStateService,
    @InjectRepository(UserEntity) private readonly userRepository: Repository<UserEntity>,
  ) {}

  public get isAuthenticated(): boolean {
    return this.authStateService.isAuthenticated;
  }

  async login(loginUser: LoginUserDto) {
    const user = await this.userRepository.findOne({
      where: { email: loginUser.email, password: loginUser.password },
    });

    if (user) {
      this.authStateService.isAuthenticated = true;
      return { token: "MY_TOKEN", userId: user.id, name: user.name };
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
