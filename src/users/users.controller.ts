import { Controller, Get, Post } from "@nestjs/common";

@Controller("users")
export class UsersController {
  @Get()
  getUsers(): string {
    return "List of users";
  }

  @Post()
  createUser(): string {
    return "User created";
  }
}
