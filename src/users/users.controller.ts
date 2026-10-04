import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import type { AuthUser } from "../auth/auth-user.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { CreateUserDto } from "./dto/create-user.dto.js";
import { UpdateUserDto } from "./dto/update-user.dto.js";
import { UserResponseDto } from "./dto/user-response.dto.js";
import { UsersService } from "./users.service.js";

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  // @HttpCode(200)
  getUsers(
    @Query("limit", new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
  ): Promise<UserResponseDto[]> {
    return this.usersService.getUsers(limit, page);
  }

  @Get(":id")
  // @HttpCode(200)
  getUserById(@Param("id", ParseIntPipe) id: number): Promise<UserResponseDto> {
    return this.usersService.getUserById(id);
  }

  @Post()
  // @HttpCode(201)
  createUser(@Body() createUserDto: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.createUser(createUserDto);
  }

  @Patch(":id")
  // @HttpCode(200)
  updateUser(
    @Param("id", ParseIntPipe) id: number,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.usersService.updateUser(id, updateUserDto);
  }

  // Closes the caller's own account. The id comes from the token, never the
  // URL, so a user can only delete themselves. Soft-deletes the user and
  // profile together, through the same deleteUser as the admin route.
  // Must come BEFORE @Delete(":id"), or "me" gets matched as an :id
  @Delete("me")
  @UseGuards(JwtAuthGuard)
  @HttpCode(204) // needs 204 No Content instead of default 200 OK
  deleteMe(@CurrentUser() user: AuthUser): Promise<void> {
    return this.usersService.deleteUser(user.userId);
  }

  @Delete(":id")
  @HttpCode(204) // needs 204 No Content instead of default 200 OK
  deleteUser(@Param("id", ParseIntPipe) id: number): Promise<void> {
    return this.usersService.deleteUser(id);
  }

  // 200, not POST's default 201: this brings back an existing user rather
  // than creating one. Unguarded like DELETE above; both need an admin guard
  // once auth carries a role.
  @Post(":id/restore")
  @HttpCode(200) // uses 200 OK instead of Nest default 201 Created
  restoreUser(@Param("id", ParseIntPipe) id: number): Promise<UserResponseDto> {
    return this.usersService.restoreUser(id);
  }
}
