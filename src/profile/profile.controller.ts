import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
} from "@nestjs/common";

import { CreateProfileDto } from "./dto/create-profile-dto.js";
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

  @Get(":id")
  getProfileById(@Param("id", ParseIntPipe) id: number): Promise<ProfileResponseDto> {
    return this.profileService.getProfileById(id);
  }

  @Get("user/:userId")
  getProfileByUserId(
    @Param("userId", ParseIntPipe) userId: number,
  ): Promise<ProfileResponseDto | null> {
    return this.profileService.getProfileByUserId(userId);
  }

  @Post()
  createProfile(@Body() createProfileDto: CreateProfileDto): Promise<number> {
    return this.profileService.createProfile(createProfileDto);
  }

  @Patch(":id")
  updateProfile(
    @Param("id", ParseIntPipe) id: number,
    @Body() updateProfileDto: UpdateProfileDto,
  ): Promise<string> {
    return this.profileService.updateProfile(id, updateProfileDto);
  }

  @Delete(":id")
  deleteProfile(@Param("id", ParseIntPipe) id: number): Promise<string> {
    return this.profileService.deleteProfile(id);
  }
}
