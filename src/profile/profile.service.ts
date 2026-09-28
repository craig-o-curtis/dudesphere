import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

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

  async getProfiles(limit?: number, page?: number): Promise<ProfileResponseDto[]> {
    return this.findAll(limit, page);
  }

  async getProfileById(id: number): Promise<ProfileResponseDto> {
    const profile = await this.profileRepository.findOne({ where: { id } });
    if (!profile) {
      throw new Error("Profile not found");
    }
    return this.toResponseDto(profile);
  }

  async getProfileByUserId(userId: number): Promise<ProfileResponseDto | null> {
    const profile = await this.profileRepository.findOne({ where: { userId } });
    if (!profile) {
      return null;
    }
    return this.toResponseDto(profile);
  }

  async createProfile(createProfileDto: CreateProfileDto): Promise<number> {
    const existing = await this.profileRepository.findOne({
      where: { userId: createProfileDto.userId },
    });
    if (existing) {
      throw new Error("Profile already exists for this user");
    }

    const newProfile = this.profileRepository.create({
      userId: createProfileDto.userId,
      firstName: createProfileDto.firstName ?? null,
      lastName: createProfileDto.lastName ?? null,
      bio: createProfileDto.bio ?? null,
      profileImageUrl: createProfileDto.profileImageUrl ?? null,
      isDude: createProfileDto.isDude ?? false,
      ordainedDate: createProfileDto.ordainedDate ?? null,
    });

    const savedProfile = await this.profileRepository.save(newProfile);
    return savedProfile.id;
  }

  async updateProfile(id: number, updateProfileDto: UpdateProfileDto): Promise<string> {
    await this.profileRepository.update(id, updateProfileDto);
    return `Profile with id: ${id} updated`;
  }

  async deleteProfile(id: number): Promise<string> {
    const result = await this.profileRepository.delete(id);
    if (result.affected === 0) {
      throw new Error("Profile not found");
    }
    return `Profile with id: ${id} deleted`;
  }

  // --- Private helpers ---

  private async findAll(limit?: number, page?: number): Promise<ProfileResponseDto[]> {
    let query = this.profileRepository.createQueryBuilder("profile");

    if (limit || page) {
      const pageSize = limit ?? 20;
      const pageNum = page ?? 1;
      query.skip((pageNum - 1) * pageSize).take(pageSize);
    }

    const profiles = await query.getMany();
    return profiles.map((profile) => this.toResponseDto(profile));
  }

  private toResponseDto(profile: Profile): ProfileResponseDto {
    return {
      id: profile.id,
      userId: profile.userId,
      firstName: profile.firstName ?? null,
      lastName: profile.lastName ?? null,
      bio: profile.bio ?? null,
      profileImageUrl: profile.profileImageUrl ?? null,
      isDude: profile.isDude,
      ordainedDate: profile.ordainedDate ?? null,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }
}
