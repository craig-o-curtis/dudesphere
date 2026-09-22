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
  ValidationPipe,
  Body,
} from "@nestjs/common";

import { CreateUserDto } from "./dto/create-user.dto.js";
import { UpdateUserDto } from "./dto/update-user.dto.js";
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
  createUser(@Body() createUserDto: CreateUserDto): number {
    return this.usersService.createUser(createUserDto);
  }

  @Patch(":id")
  updateUser(@Param("id", ParseIntPipe) id: number, @Body() updateUserDto: UpdateUserDto): string {
    return this.usersService.updateUser(id, updateUserDto);
  }

  @Delete(":id")
  deleteUser(@Param("id", ParseIntPipe) id: number): string {
    return this.usersService.deleteUser(id);
  }
}
