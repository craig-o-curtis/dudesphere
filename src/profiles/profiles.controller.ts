import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from "@nestjs/common";

import type { AuthUser } from "../auth/auth-user.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { Public } from "../shared/decorators/public.decorator.js";
import { ProfileResponseDto } from "./dto/profile-response.dto.js";
import { UpdateProfileDto } from "./dto/update-profile-dto.js";
import { ProfilesService } from "./profiles.service.js";

@Controller("profiles")
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Public()
  @Get()
  getProfiles(
    @Query("limit", new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
  ): Promise<ProfileResponseDto[]> {
    return this.profilesService.getProfiles(limit, page);
  }

  // The profile of the logged-in user. The user id comes from the JWT token
  // in the Authorization header, never from the URL, so a caller can only
  // ever read their own.
  // Must come BEFORE @Get(":id"), or "me" gets matched as an :id.
  //
  // Auth flow:
  //   1. Frontend calls POST /auth/login with email + password.
  //   2. Backend validates credentials and returns a signed JWT token.
  //   3. Frontend stores the token and sends it on every protected request:
  //        Authorization: Bearer <token>
  //   4. JwtAuthGuard extracts the token, verifies its signature and expiry,
  //      then populates request.user with { userId, username, role }.
  //   5. @CurrentUser() reads that user object from the request.
  @Get("me")
  getMyProfile(@CurrentUser() user: AuthUser): Promise<ProfileResponseDto> {
    return this.profilesService.getProfileByUserId(user.userId);
  }

  // Must come BEFORE @Get(":id"), or "user" gets matched as an :id
  @Public()
  @Get("user/:userId")
  getProfileByUserId(@Param("userId", ParseIntPipe) userId: number): Promise<ProfileResponseDto> {
    return this.profilesService.getProfileByUserId(userId);
  }

  @Public()
  @Get(":id")
  getProfileById(@Param("id", ParseIntPipe) id: number): Promise<ProfileResponseDto> {
    return this.profilesService.getProfileById(id);
  }

  // The logged-in user updates their own profile. The id comes from the JWT
  // token, never from the URL, so a user can only ever update their own
  // profile. Must come BEFORE @Patch(":id"), or "me" gets matched as that
  // param.
  //
  // Auth flow: same as GET /profiles/me — see that comment above.
  @Patch("me")
  async updateMyProfile(
    @Body() updateProfileDto: UpdateProfileDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ProfileResponseDto> {
    const profile = await this.profilesService.getProfileByUserId(user.userId);
    return this.profilesService.updateProfile(profile.id, updateProfileDto, user);
  }

  // Any profile, by id. The service decides who may: an admin edits anyone's,
  // and everyone else only their own, which is the same rule PATCH /profiles/me
  // goes through above.
  @Patch(":id")
  updateProfile(
    @Param("id", ParseIntPipe) id: number,
    @Body() updateProfileDto: UpdateProfileDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ProfileResponseDto> {
    return this.profilesService.updateProfile(id, updateProfileDto, user);
  }

  // No deleteProfile endpoint. A profile is soft-deleted together with its
  // user, in the same transaction, by UsersService.deleteUser. The
  // ON DELETE CASCADE on the foreign key only fires on a real DELETE, which
  // this app never runs.

  // admin reset profile
}
