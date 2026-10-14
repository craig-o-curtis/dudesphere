import { CurrentUser } from "@nestjs/authentication";
import { Can } from "@nestjs/authorization";
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";

import { PgIdParamDto } from "../shared/dto/pg-id-param.dto.js";
import { PaginationQueryDto } from "../shared/pagination/dto/pagination-query.dto.js";
import type { Paginated } from "../shared/pagination/paginated.interface.js";
import { PaginationProvider } from "../shared/pagination/pagination.provider.js";
import { CreateUserDto } from "./dto/create-user.dto.js";
import { UpdateMyUserDto } from "./dto/update-my-user.dto.js";
import { UpdateUserDto } from "./dto/update-user.dto.js";
import { UserResponseDto } from "./dto/user-response.dto.js";
import type { User } from "./user.entity.js";
import { UserPolicy } from "./user.policy.js";
import { UsersService } from "./users.service.js";

// Every route here needs a signed-in member: AuthenticationModule's global
// guard refuses anyone else with a 401. Each route then declares who may
// call it, for AuthorizationModule's global guard, which refuses a route that
// declares nothing.
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
  @Can(UserPolicy, "viewAll")
  @Get()
  // @HttpCode(200)
  async getUsers(@Query() pageRequest: PaginationQueryDto): Promise<Paginated<UserResponseDto>> {
    const users = await this.usersService.getUsers(pageRequest);
    return this.paginationProvider.toResponse(users, pageRequest, "/users");
  }

  @Can.Anyone()
  @Get("me")
  getMyUser(@CurrentUser() user: User): Promise<UserResponseDto> {
    return this.usersService.getUserById(user.id);
  }

  // That user or an admin. The answer carries the email and the role, so no
  // other member may read it. The service enforces it, after the lookup, so
  // a missing user is a 404 for every caller.
  @Can.Anyone()
  @Get(":id")
  getUserById(@Param() { id }: PgIdParamDto, @CurrentUser() user: User): Promise<UserResponseDto> {
    return this.usersService.getUserForCaller(id, user);
  }

  // Admin only. Anyone else signs up through POST /auth/sign-up, which is
  // public and calls the same UsersService.createUser.
  @Can(UserPolicy, "create")
  @Post()
  // @HttpCode(201)
  createUser(@Body() createUserDto: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.createUser(createUserDto);
  }

  // The signed-in member updates their own account. The id comes from the
  // access token in the Authorization header, never from the URL, so a member
  // can only ever update themselves. Must come BEFORE @Patch(":id"), or "me"
  // gets matched as that param.
  //
  // Auth flow: same as DELETE /users/me — see that comment below.
  //
  // A new password also needs `currentPassword`. See UsersService.updateMyUser.
  @Can.Anyone()
  @Patch("me")
  updateMyUser(
    @Body() updateMyUserDto: UpdateMyUserDto,
    @CurrentUser() user: User,
  ): Promise<UserResponseDto> {
    return this.usersService.updateMyUser(user.id, updateMyUserDto);
  }

  // Any account, by id. Admin only — a user edits their own through
  // PATCH /users/me above.
  @Can(UserPolicy, "update")
  @Patch(":id")
  // @HttpCode(200)
  updateUser(
    @Param() { id }: PgIdParamDto,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.usersService.updateUser(id, updateUserDto);
  }

  // Closes the caller's own account. The user id comes from the access token
  // in the Authorization header, never from the URL, so a member can only
  // delete themselves. Soft-deletes the user and profile together, through
  // the same deleteUser as the admin route.
  // Must come BEFORE @Delete(":id"), or "me" gets matched as an :id.
  //
  // Auth flow:
  //   1. Frontend calls POST /auth/token with a username or email, and a
  //      password.
  //   2. Backend checks the credentials and returns an access token (a
  //      signed JWT) and a refresh token.
  //   3. Frontend stores both and sends the access token on every protected
  //      request:
  //        Authorization: Bearer <accessToken>
  //   4. AuthenticationModule's global guard verifies the token's signature
  //      and expiry, then JwtAuth.validate loads the member from the
  //      database and the guard puts them on request.user.
  //   5. @CurrentUser() reads that member from the request.
  //   6. When the access token runs out, the frontend swaps the refresh
  //      token for a new pair at POST /auth/token/refresh.
  @Can.Anyone()
  @Delete("me")
  @HttpCode(204) // needs 204 No Content instead of default 200 OK
  deleteMe(@CurrentUser() user: User): Promise<void> {
    return this.usersService.deleteUser(user.id);
  }

  // Admin only — a user closes their own account through DELETE /users/me.
  @Can(UserPolicy, "delete")
  @Delete(":id")
  @HttpCode(204) // needs 204 No Content instead of default 200 OK
  deleteUser(@Param() { id }: PgIdParamDto): Promise<void> {
    return this.usersService.deleteUser(id);
  }

  // 200, not POST's default 201: this brings back an existing user rather
  // than creating one. Admin only, like DELETE above.
  @Can(UserPolicy, "restore")
  @Post(":id/restore")
  @HttpCode(200) // uses 200 OK instead of Nest default 201 Created
  restoreUser(@Param() { id }: PgIdParamDto): Promise<UserResponseDto> {
    return this.usersService.restoreUser(id);
  }
}
