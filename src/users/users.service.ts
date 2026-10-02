import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";

import { ProfileResponseDto } from "../profile/dto/profile-response.dto.js";
import { Profile } from "../profile/profile.entity.js";
import { ProfileService } from "../profile/profile.service.js";
import { CreateUserDto } from "./dto/create-user.dto.js";
import { UpdateUserDto } from "./dto/update-user.dto.js";
import { UserResponseDto } from "./dto/user-response.dto.js";
import { User } from "./user.entity.js";

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly profileService: ProfileService,
  ) {}

  async getUsers(limit: number = 10, page: number = 1): Promise<UserResponseDto[]> {
    const pageSize = limit;
    const pageNum = page;
    const users = await this.usersRepository.find({
      skip: (pageNum - 1) * pageSize,
      take: pageSize,
    });
    return users.map((user) => this.toResponseDto(user));
  }

  async getUserById(id: number): Promise<UserResponseDto> {
    const user = await this.usersRepository.findOne({
      where: { id },
      relations: { profile: true },
    });
    if (!user) {
      throw new NotFoundException(`User #${id} not found`);
    }
    return this.toResponseDto(user, user.profile);
  }

  async getUserByEmail(email: string): Promise<UserResponseDto | null> {
    const user = await this.usersRepository.findOne({ where: { email } });
    if (!user) {
      return null;
    }
    return this.toResponseDto(user);
  }

  async createUser(createUserDto: CreateUserDto): Promise<UserResponseDto> {
    // Everything inside this callback is ONE transaction.
    // If anything throws, both inserts are rolled back.
    // Rule: inside here, use `manager` for every query — never this.usersRepository.
    return this.dataSource.transaction(async (manager) => {
      const existing = await manager.findOne(User, { where: { email: createUserDto.email } });
      if (existing) {
        throw new ConflictException("Email already registered");
      }

      const user = await manager.save(
        User,
        manager.create(User, {
          username: createUserDto.username,
          email: createUserDto.email,
          password: createUserDto.password,
        }),
      );

      const profile = await this.profileService.createForUser(
        manager,
        user.id,
        createUserDto.profile,
      );

      return this.toResponseDto(user, profile);
    });
  }

  async updateUser(id: number, updateUserDto: UpdateUserDto): Promise<UserResponseDto> {
    if (updateUserDto.email) {
      const existing = await this.usersRepository.findOne({
        where: { email: updateUserDto.email },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException("Email already registered");
      }
    }

    // Profile fields are updated through PATCH /profiles/:id, not here
    const { profile: _profile, ...userFields } = updateUserDto;
    const result = await this.usersRepository.update(id, userFields);
    if (result.affected === 0) {
      throw new NotFoundException(`User #${id} not found`);
    }
    return this.getUserById(id);
  }

  async deleteUser(id: number): Promise<void> {
    // Soft delete: sets deletedAt instead of removing the row.
    const result = await this.usersRepository.softDelete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`User #${id} not found`);
    }
  }

  private toResponseDto(user: User, profile?: Profile | null): UserResponseDto {
    return new UserResponseDto({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      profile: profile ? ProfileResponseDto.fromEntity(profile) : undefined,
    });
  }
}
