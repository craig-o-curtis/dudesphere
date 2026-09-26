import { Injectable, Inject, forwardRef } from "@nestjs/common";

import { AuthService } from "../auth/auth.service.js";
import { CreateUserDto } from "./dto/create-user.dto.js";
import { UpdateUserDto } from "./dto/update-user.dto.js";
import { UserResponseDto } from "./dto/user-response.dto.js";

@Injectable()
export class UsersService {
  constructor(@Inject(forwardRef(() => AuthService)) private readonly authService: AuthService) {}
  // for now mock users in the constructor
  private users: UserResponseDto[] = [
    {
      id: 1,
      name: "John Doe",
      email: "john@doe.com",
      password: "password",
      isDude: true,
    },
    {
      id: 2,
      name: "Jane Doe",
      email: "jane@doe.com",
      password: "password",
      isDude: false,
    },
  ];

  getUsers(limit?: number, page?: number): UserResponseDto[] {
    if (!this.authService.isAuthenticated) {
      throw new Error("User is not authenticated");
    }

    let result = this.users;

    if (limit || page) {
      const pageSize = limit ?? 20;
      const pageNum = page ?? 1;
      const startIndex = (pageNum - 1) * pageSize;
      const endIndex = pageNum * pageSize;
      result = result.slice(startIndex, endIndex);
    }

    return result;
  }

  getUserById(id: number): UserResponseDto {
    const user = this.users.find((user) => user.id === id);
    if (!user) {
      throw new Error("User not found");
    }

    return user;
  }

  getDudes(limit?: number, page?: number): UserResponseDto[] {
    let result = this.users.filter((user) => user.isDude);

    if (limit || page) {
      const pageSize = limit ?? 20;
      const pageNum = page ?? 1;
      const startIndex = (pageNum - 1) * pageSize;
      const endIndex = pageNum * pageSize;
      result = result.slice(startIndex, endIndex);
    }

    return result;
  }

  getNonDudes(limit?: number, page?: number): UserResponseDto[] {
    let result = this.users.filter((user) => !user.isDude);

    if (limit || page) {
      const pageSize = limit ?? 20;
      const pageNum = page ?? 1;
      const startIndex = (pageNum - 1) * pageSize;
      const endIndex = pageNum * pageSize;
      result = result.slice(startIndex, endIndex);
    }

    return result;
  }

  createUser(createUserDto: CreateUserDto): number {
    // create a new user
    const { isDude, ...rest } = createUserDto;
    const newUser = {
      id: this.users.length + 1,
      ...rest,
      isDude: isDude ?? false,
    };
    this.users.push(newUser);
    return newUser.id;
  }

  updateUser(id: number, updateUserDto: UpdateUserDto): string {
    const userIndex = this.users.findIndex((user) => user.id === id);
    if (userIndex !== -1) {
      this.users[userIndex] = Object.assign({}, this.users[userIndex], updateUserDto);
    }

    return "User with id: " + id + " updated";
  }

  deleteUser(id: number): string {
    // find user, delete
    const userIndex = this.users.findIndex((user) => user.id === id);
    if (userIndex === -1) {
      throw new Error("User not found");
    }

    this.users.splice(userIndex, 1);

    return "User with id: " + id + " deleted";
  }
}
