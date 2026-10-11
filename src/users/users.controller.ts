import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";

import { PgIdParamDto } from "../shared/dto/pg-id-param.dto.js";
import type { AuthUser } from "../shared/guards/auth-user.js";
import { Auth } from "../shared/guards/auth.decorator.js";
import { CurrentUser } from "../shared/guards/current-user.decorator.js";
import { PaginationQueryDto } from "../shared/pagination/dto/pagination-query.dto.js";
import type { Paginated } from "../shared/pagination/paginated.interface.js";
import { PaginationProvider } from "../shared/pagination/pagination.provider.js";
import { CreateUserDto } from "./dto/create-user.dto.js";
import { UpdateMyUserDto } from "./dto/update-my-user.dto.js";
import { UpdateUserDto } from "./dto/update-user.dto.js";
import { UserResponseDto } from "./dto/user-response.dto.js";
import { UserRole } from "./user.entity.js";
import { UsersService } from "./users.service.js";

@Auth()
@Controller("users")
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly paginationProvider: PaginationProvider,
  ) {}

  // Admin only. This route returned every user's email address to anyone who
  // asked, with no token, which made it a mass harvest. A single record is
  // for that user or an admin below, and a signed-in user reads their own
  // through GET /users/me.
  @Auth(UserRole.ADMIN)
  @Get()
  // @HttpCode(200)
  async getUsers(@Query() pageRequest: PaginationQueryDto): Promise<Paginated<UserResponseDto>> {
    const users = await this.usersService.getUsers(pageRequest);
    return this.paginationProvider.toResponse(users, pageRequest, "/users");
  }

  @Get("me")
  getMyUser(@CurrentUser() user: AuthUser): Promise<UserResponseDto> {
    return this.usersService.getUserById(user.userId);
  }

  // That user or an admin. The answer carries the email and the role, so no
  // other member may read it. The service enforces it.
  @Get(":id")
  getUserById(
    @Param() { id }: PgIdParamDto,
    @CurrentUser() user: AuthUser,
  ): Promise<UserResponseDto> {
    return this.usersService.getUserForCaller(id, user);
  }

  // Admin only. Anyone else signs up through POST /auth/signup, which is
  // public and calls the same UsersService.createUser.
  @Auth(UserRole.ADMIN)
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
  //
  // A new password also needs `currentPassword`. See UsersService.updateMyUser.
  @Patch("me")
  updateMyUser(
    @Body() updateMyUserDto: UpdateMyUserDto,
    @CurrentUser() user: AuthUser,
  ): Promise<UserResponseDto> {
    return this.usersService.updateMyUser(user.userId, updateMyUserDto);
  }

  // Any account, by id. Admin only — a user edits their own through
  // PATCH /users/me above.
  @Auth(UserRole.ADMIN)
  @Patch(":id")
  // @HttpCode(200)
  updateUser(
    @Param() { id }: PgIdParamDto,
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
  //   1. Frontend calls POST /auth/token with a username or email, and a password.
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
  @Auth(UserRole.ADMIN)
  @Delete(":id")
  @HttpCode(204) // needs 204 No Content instead of default 200 OK
  deleteUser(@Param() { id }: PgIdParamDto): Promise<void> {
    return this.usersService.deleteUser(id);
  }

  // 200, not POST's default 201: this brings back an existing user rather
  // than creating one. Admin only, like DELETE above.
  @Auth(UserRole.ADMIN)
  @Post(":id/restore")
  @HttpCode(200) // uses 200 OK instead of Nest default 201 Created
  restoreUser(@Param() { id }: PgIdParamDto): Promise<UserResponseDto> {
    return this.usersService.restoreUser(id);
  }
}
