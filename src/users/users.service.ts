import { Injectable } from "@nestjs/common";

import { CreateUserDto } from "./dto/create-user.dto.js";
import { UpdateUserDto } from "./dto/update-user.dto.js";

@Injectable()
export class UsersService {
  // for now mock users in the constructor
  private users = [
    {
      id: 1,
      name: "John Doe",
    },
    {
      id: 2,
      name: "Jane Doe",
    },
  ];

  getUsers(limit?: number, page?: number): unknown {
    let users = this.users;

    if (limit && page) {
      const startIndex = (page - 1) * limit;
      const endIndex = page * limit;
      return users.slice(startIndex, endIndex);
    }

    return users;
  }

  getUser(id: number): unknown {
    return this.users.find((user) => user.id === id);
  }

  createUser(createUserDto: CreateUserDto): number {
    // create a new user
    const newUser = {
      id: this.users.length + 1,
      ...createUserDto,
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
    if (userIndex !== -1) {
      this.users.splice(userIndex, 1);
    }

    return "User with id: " + id + " deleted";
  }
}
