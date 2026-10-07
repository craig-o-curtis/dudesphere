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
} from "@nestjs/common";

import type { AuthUser } from "../auth/auth-user.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { Public } from "../shared/decorators/public.decorator.js";
import { Roles } from "../shared/decorators/roles.decorator.js";
import { CreateUserDto } from "./dto/create-user.dto.js";
import { ListUsersQueryDto } from "./dto/list-users-query.dto.js";
import { UpdateUserDto } from "./dto/update-user.dto.js";
import { UserResponseDto } from "./dto/user-response.dto.js";
import { UserRole } from "./user.entity.js";
import { UsersService } from "./users.service.js";

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // Admin only. This route returned every user's email address to anyone who
  // asked, with no token, which made it a mass harvest. A single record stays
  // public below, and a signed-in user reads their own through GET /users/me.
  @Roles(UserRole.ADMIN)
  @Get()
  // @HttpCode(200)
  getUsers(@Query() query: ListUsersQueryDto): Promise<UserResponseDto[]> {
    return this.usersService.getUsers(query.limit, query.page);
  }

  @Get("me")
  getMyUser(@CurrentUser() user: AuthUser): Promise<UserResponseDto> {
    return this.usersService.getUserById(user.userId);
  }

  @Public()
  @Get(":id")
  // @HttpCode(200)
  getUserById(@Param("id", ParseIntPipe) id: number): Promise<UserResponseDto> {
    return this.usersService.getUserById(id);
  }

  // Public: registration is how someone gets their first token.
  @Public()
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
  updateMyUser(
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() user: AuthUser,
  ): Promise<UserResponseDto> {
    return this.usersService.updateUser(user.userId, updateUserDto);
  }

  // Any account, by id. Admin only — a user edits their own through
  // PATCH /users/me above.
  @Roles(UserRole.ADMIN)
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
  @HttpCode(204) // needs 204 No Content instead of default 200 OK
  deleteMe(@CurrentUser() user: AuthUser): Promise<void> {
    return this.usersService.deleteUser(user.userId);
  }

  // Admin only — a user closes their own account through DELETE /users/me.
  @Roles(UserRole.ADMIN)
  @Delete(":id")
  @HttpCode(204) // needs 204 No Content instead of default 200 OK
  deleteUser(@Param("id", ParseIntPipe) id: number): Promise<void> {
    return this.usersService.deleteUser(id);
  }

  // 200, not POST's default 201: this brings back an existing user rather
  // than creating one. Admin only, like DELETE above.
  @Roles(UserRole.ADMIN)
  @Post(":id/restore")
  @HttpCode(200) // uses 200 OK instead of Nest default 201 Created
  restoreUser(@Param("id", ParseIntPipe) id: number): Promise<UserResponseDto> {
    return this.usersService.restoreUser(id);
  }
}
