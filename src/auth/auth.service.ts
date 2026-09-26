import { Injectable, Inject, forwardRef } from "@nestjs/common";

import { UsersService } from "../users/users.service.js";
import { LoginUserDto } from "./dto/login-user.dto.js";

@Injectable()
export class AuthService {
  constructor(
    @Inject(forwardRef(() => UsersService)) private readonly usersService: UsersService,
  ) {}

  public isAuthenticated: boolean = false;

  login(loginUser: LoginUserDto) {
    const user = this.usersService
      .getUsers()
      .find((u) => u.email === loginUser.email && u.password === loginUser.password);

    if (user) {
      return { token: "MY_TOKEN", userId: user.id, name: user.name };
    }
    throw new Error("User does not exist");
  }
}
