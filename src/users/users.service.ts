import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { getUtcNow } from "@northguild/gmt";
import { Repository } from "typeorm";

import { CreateUserDto } from "./dto/create-user.dto.js";
import { UpdateUserDto } from "./dto/update-user.dto.js";
import { UserResponseDto } from "./dto/user-response.dto.js";
import { User } from "./user.entity.js";

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly usersRepository: Repository<User>) {}

  async getUsers(limit?: number, page?: number): Promise<UserResponseDto[]> {
    return this.findAll({ isDude: undefined }, limit, page);
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

  async getDudes(limit?: number, page?: number): Promise<UserResponseDto[]> {
    return this.findAll({ isDude: true }, limit, page);
  }

  async getNonDudes(limit?: number, page?: number): Promise<UserResponseDto[]> {
    return this.findAll({ isDude: false }, limit, page);
  }

  async createUser(createUserDto: CreateUserDto): Promise<number> {
    const now = getUtcNow();
    const newUser = this.usersRepository.create({
      name: createUserDto.name,
      email: createUserDto.email,
      password: createUserDto.password,
      isDude: createUserDto.isDude ?? false,
      createdAt: now,
      updatedAt: now,
    });

    const savedUser = await this.usersRepository.save(newUser);
    return savedUser.id;
  }

  async updateUser(id: number, updateUserDto: UpdateUserDto): Promise<string> {
    await this.usersRepository.update(id, updateUserDto);
    return `User with id: ${id} updated`;
  }

  async deleteUser(id: number): Promise<string> {
    const result = await this.usersRepository.delete(id);
    if (result.affected === 0) {
      throw new Error("User not found");
    }
    return `User with id: ${id} deleted`;
  }

  // --- Private helpers ---

  private async findAll(
    where: Partial<User>,
    limit?: number,
    page?: number,
  ): Promise<UserResponseDto[]> {
    // Filter out undefined values from where clause
    const filteredWhere = Object.fromEntries(
      Object.entries(where).filter(([_, v]) => v !== undefined),
    );

    let query = this.usersRepository.createQueryBuilder("user");
    if (Object.keys(filteredWhere).length > 0) {
      query = query.where(filteredWhere);
    }

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
      name: user.name,
      email: user.email,
      role: user.role,
      isDude: user.isDude,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
