import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";

import { CreateProfileDto } from "./dto/create-profile-dto.js";
import { ProfileResponseDto } from "./dto/profile-response.dto.js";
import { UpdateProfileDto } from "./dto/update-profile-dto.js";
import { Profile } from "./profile.entity.js";

@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(Profile)
    private readonly profileRepository: Repository<Profile>,
  ) {}

  async getProfiles(limit: number = 10, page: number = 1): Promise<ProfileResponseDto[]> {
    const pageSize = limit;
    const pageNum = page;
    const profiles = await this.profileRepository.find({
      skip: (pageNum - 1) * pageSize,
      take: pageSize,
    });
    return profiles.map((profile) => ProfileResponseDto.fromEntity(profile));
  }

  async getProfileById(id: number): Promise<ProfileResponseDto> {
    const profile = await this.profileRepository.findOne({ where: { id } });
    if (!profile) {
      throw new NotFoundException(`Profile #${id} not found`);
    }
    return ProfileResponseDto.fromEntity(profile);
  }

  async getProfileByUserId(userId: number): Promise<ProfileResponseDto> {
    const profile = await this.profileRepository.findOne({ where: { userId } });
    if (!profile) {
      throw new NotFoundException(`Profile for user #${userId} not found`);
    }
    return ProfileResponseDto.fromEntity(profile);
  }

  // Called by UsersService inside its transaction.
  // It uses the `manager` it is given, NOT this.profileRepository,
  // so the insert is part of the same transaction as the user insert.
  async createForUser(
    manager: EntityManager,
    userId: number,
    dto?: CreateProfileDto,
  ): Promise<Profile> {
    const profile = manager.create(Profile, {
      userId,
      firstName: dto?.firstName ?? null,
      lastName: dto?.lastName ?? null,
      bio: dto?.bio ?? null,
      profileImageUrl: dto?.profileImageUrl ?? null,
      isDude: dto?.isDude ?? false,
      ordainedDate: dto?.ordainedDate ?? null,
    });
    return manager.save(Profile, profile);
  }

  async updateProfile(id: number, updateProfileDto: UpdateProfileDto): Promise<ProfileResponseDto> {
    const result = await this.profileRepository.update(id, updateProfileDto);
    if (result.affected === 0) {
      throw new NotFoundException(`Profile #${id} not found`);
    }
    return this.getProfileById(id);
  }
}
