import { ConflictException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { Profile } from "../profile/profile.entity.js";
import { CreateUserDto } from "./dto/create-user.dto.js";
import { UpdateUserDto } from "./dto/update-user.dto.js";
import { UserResponseDto } from "./dto/user-response.dto.js";
import { User } from "./user.entity.js";

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    @InjectRepository(Profile) private readonly profilesRepository: Repository<Profile>,
  ) {}

  async getUsers(limit?: number, page?: number): Promise<UserResponseDto[]> {
    return this.findAll(limit, page);
  }

  async getUserById(id: number): Promise<UserResponseDto> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new Error("User not found");
    }
    return this.toResponseDto(user);
  }

  async getUserByEmail(email: string): Promise<UserResponseDto | null> {
    const user = await this.usersRepository.findOne({ where: { email } });
    if (!user) {
      return null;
    }
    return this.toResponseDto(user);
  }

  async createUser(createUserDto: CreateUserDto): Promise<number> {
    const existing = await this.usersRepository.findOne({ where: { email: createUserDto.email } });
    if (existing) {
      throw new ConflictException("Email already registered"); // Returns code 409
    }

    // .create returns TypeORM entity instance tracked by repository's persistence context
    const newUser = this.usersRepository.create({
      username: createUserDto.username,
      email: createUserDto.email,
      password: createUserDto.password,
    });

    // .save inserts into the table
    const savedUser = await this.usersRepository.save(newUser);
    return savedUser.id;
  }

  async updateUser(id: number, updateUserDto: UpdateUserDto): Promise<string> {
    // Check for email conflicts (only if email is being updated)
    if (updateUserDto.email) {
      const existing = await this.usersRepository.findOne({
        where: { email: updateUserDto.email },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException("Email already registered");
      }
    }

    // Update user fields only (profile updates handled separately)
    const { profile: _, ...userFields } = updateUserDto;
    await this.usersRepository.update(id, userFields);

    return `User with id: ${id} updated`;
  }

  async deleteUser(id: number): Promise<string> {
    // Then delete the user
    const result = await this.usersRepository.delete(id);
    if (result.affected === 0) {
      throw new Error("User not found");
    }
    return `User with id: ${id} deleted`;
  }

  // --- Private helpers ---

  private async findAll(limit?: number, page?: number): Promise<UserResponseDto[]> {
    let query = this.usersRepository.createQueryBuilder("user");

    if (limit || page) {
      const pageSize = limit ?? 20;
      const pageNum = page ?? 1;
      query.skip((pageNum - 1) * pageSize).take(pageSize);
    }

    const users = await query.getMany();
    return users.map((user) => this.toResponseDto(user));
  }

  private toResponseDto(user: User): UserResponseDto {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
