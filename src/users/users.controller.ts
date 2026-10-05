import {
  Body,
  Controller,
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
import { ListUsersQueryDto } from "./dto/list-users-query.dto.js";
import { UpdateUserDto } from "./dto/update-user.dto.js";
import { UserResponseDto } from "./dto/user-response.dto.js";
import { UsersService } from "./users.service.js";

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  // @HttpCode(200)
  getUsers(@Query() query: ListUsersQueryDto): Promise<UserResponseDto[]> {
    return this.usersService.getUsers(query.limit, query.page);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  getMyUser(@CurrentUser() user: AuthUser): Promise<UserResponseDto> {
    return this.usersService.getUserById(user.userId);
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

  // The logged-in user updates their own account. The id comes from the JWT
  // token in the Authorization header, never from the URL, so a user can only
  // ever update themselves. Must come BEFORE @Patch(":id"), or "me" gets
  // matched as that param.
  //
  // Auth flow: same as GET /users/me — see that comment above.
  @Patch("me")
  @UseGuards(JwtAuthGuard)
  updateMyUser(
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() user: AuthUser,
  ): Promise<UserResponseDto> {
    return this.usersService.updateUser(user.userId, updateUserDto);
  }

  @Patch(":id")
  // @HttpCode(200)
  updateUser(
    @Param("id", ParseIntPipe) id: number,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.usersService.updateUser(id, updateUserDto);
  }

  // Closes the caller's own account. The user id comes from the JWT token in
  // the Authorization header, never from the URL, so a user can only delete
  // themselves. Soft-deletes the user and profile together, through the same
  // deleteUser as the admin route.
  // Must come BEFORE @Delete(":id"), or "me" gets matched as an :id.
  //
  // Auth flow:
  //   1. Frontend calls POST /auth/login with email + password.
  //   2. Backend validates credentials and returns a signed JWT token.
  //   3. Frontend stores the token and sends it on every protected request:
  //        Authorization: Bearer <token>
  //   4. JwtAuthGuard extracts the token, verifies its signature and expiry,
  //      then populates request.user with { userId, username, role }.
  //   5. @CurrentUser() reads that user object from the request.
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
