import {
  Param,
  Controller,
  Delete,
  Get,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  DefaultValuePipe,
} from "@nestjs/common";
import { UsersService } from "./users.service.js";

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  getUsers(
    @Query("limit", new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
  ) {
    return this.usersService.getUsers(limit, page);
  }

  @Get(":id")
  getUser(@Param("id", ParseIntPipe) id: number): unknown {
    return this.usersService.getUser(id);
  }

  @Post()
  createUser(): number {
    return this.usersService.createUser();
  }

  @Patch(":id")
  updateUser(@Param("id", ParseIntPipe) id: number, user: { name: string }): string {
    return this.usersService.updateUser(id, user);
  }

  @Delete(":id")
  deleteUser(@Param("id", ParseIntPipe) id: number): string {
    return this.usersService.deleteUser(id);
  }
}
