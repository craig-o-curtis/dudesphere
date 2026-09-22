import { Injectable } from "@nestjs/common";

import { CreateUserDto } from "./dto/create-user.dto.js";
import { UpdateUserDto } from "./dto/update-user.dto.js";
import { UserResponseDto } from "./dto/user-response.dto.js";

@Injectable()
export class UsersService {
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

  getUsers(limit?: number, page?: number, isDude?: boolean): unknown {
    let users = this.users.filter((user) => {
      if (isDude) {
        return user.isDude;
      }
      return true;
    });

    if (limit && page) {
      const startIndex = (page - 1) * limit;
      const endIndex = page * limit;
      return users.slice(startIndex, endIndex);
    }

    return users;
  }

  getUser(id: number): UserResponseDto {
    const user = this.users.find((user) => user.id === id);
    if (!user) {
      throw new Error("User not found");
    }

    return user;
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
      this.users[userIndex] = {
        ...this.users[userIndex],
        ...updateUserDto,
      };
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
