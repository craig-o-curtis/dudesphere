import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, IsNull, Repository } from "typeorm";

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

  // Called by UsersService inside its transaction, like createForUser
  async softDeleteForUser(manager: EntityManager, userId: number): Promise<void> {
    // IsNull() here is to ensure we only soft-delete the profile if it hasn't already been soft-deleted.
    // it is not `null`, but rather the `deletedAt` column is `null` (meaning it is not deleted yet).
    await manager.softDelete(Profile, { userId, deletedAt: IsNull() });
  }

  async updateProfile(id: number, updateProfileDto: UpdateProfileDto): Promise<ProfileResponseDto> {
    // deletedAt: IsNull() because update() does not apply the soft-delete
    // filter that find() does. Without it a deleted profile gets edited and
    // the caller still gets a 404 from getProfileById below.
    const result = await this.profileRepository.update(
      { id, deletedAt: IsNull() },
      updateProfileDto,
    );
    if (result.affected === 0) {
      throw new NotFoundException(`Profile #${id} not found`);
    }
    return this.getProfileById(id);
  }
}
