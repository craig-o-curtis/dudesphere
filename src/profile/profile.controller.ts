import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  UseGuards,
} from "@nestjs/common";

import type { AuthUser } from "../auth/auth-user.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { ProfileResponseDto } from "./dto/profile-response.dto.js";
import { UpdateProfileDto } from "./dto/update-profile-dto.js";
import { ProfileService } from "./profile.service.js";

@Controller("profiles")
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  getProfiles(
    @Query("limit", new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
  ): Promise<ProfileResponseDto[]> {
    return this.profileService.getProfiles(limit, page);
  }

  // The profile of the logged-in user. The user id comes from the token, never
  // from the URL, so a caller can only ever read their own.
  // Must come BEFORE @Get(":id"), or "me" gets matched as an :id
  @Get("me")
  @UseGuards(JwtAuthGuard)
  getMyProfile(@CurrentUser() user: AuthUser): Promise<ProfileResponseDto> {
    return this.profileService.getProfileByUserId(user.userId);
  }

  // Must come BEFORE @Get(":id"), or "user" gets matched as an :id
  @Get("user/:userId")
  getProfileByUserId(@Param("userId", ParseIntPipe) userId: number): Promise<ProfileResponseDto> {
    return this.profileService.getProfileByUserId(userId);
  }

  @Get(":id")
  getProfileById(@Param("id", ParseIntPipe) id: number): Promise<ProfileResponseDto> {
    return this.profileService.getProfileById(id);
  }

  @Patch(":id")
  updateProfile(
    @Param("id", ParseIntPipe) id: number,
    @Body() updateProfileDto: UpdateProfileDto,
  ): Promise<ProfileResponseDto> {
    return this.profileService.updateProfile(id, updateProfileDto);
  }

  // No deleteProfile endpoint. A profile is soft-deleted together with its
  // user, in the same transaction, by UsersService.deleteUser. The
  // ON DELETE CASCADE on the foreign key only fires on a real DELETE, which
  // this app never runs.
}
