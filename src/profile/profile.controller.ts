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
