import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { CreateUserDto } from "./dto/create-user.dto.js";
import { UpdateUserDto } from "./dto/update-user.dto.js";
import { UserResponseDto } from "./dto/user-response.dto.js";
import { UserEntity } from "./users.entity.js";

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity) private readonly usersRepository: Repository<UserEntity>,
  ) {}

  async getUsers(limit?: number, page?: number): Promise<UserResponseDto[]> {
    let query = this.usersRepository.createQueryBuilder("user");

    if (limit || page) {
      const pageSize = limit ?? 20;
      const pageNum = page ?? 1;
      const startIndex = (pageNum - 1) * pageSize;
      query.skip(startIndex).take(pageSize);
    }

    const users = await query.getMany();
    return users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      isDude: user.isDude,
      createdAt: user.createdAt,
    }));
  }

  async getUserById(id: number): Promise<UserResponseDto> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new Error("User not found");
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      isDude: user.isDude,
      createdAt: user.createdAt,
    };
  }

  async getDudes(limit?: number, page?: number): Promise<UserResponseDto[]> {
    let query = this.usersRepository
      .createQueryBuilder("user")
      .where("user.isDude = :isDude", { isDude: true });

    if (limit || page) {
      const pageSize = limit ?? 20;
      const pageNum = page ?? 1;
      const startIndex = (pageNum - 1) * pageSize;
      query.skip(startIndex).take(pageSize);
    }

    const users = await query.getMany();
    return users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      isDude: user.isDude,
      createdAt: user.createdAt,
    }));
  }

  async getNonDudes(limit?: number, page?: number): Promise<UserResponseDto[]> {
    let query = this.usersRepository
      .createQueryBuilder("user")
      .where("user.isDude = :isDude", { isDude: false });

    if (limit || page) {
      const pageSize = limit ?? 20;
      const pageNum = page ?? 1;
      const startIndex = (pageNum - 1) * pageSize;
      query.skip(startIndex).take(pageSize);
    }

    const users = await query.getMany();
    return users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      isDude: user.isDude,
      createdAt: user.createdAt,
    }));
  }

  async createUser(createUserDto: CreateUserDto): Promise<number> {
    const newUser = this.usersRepository.create({
      name: createUserDto.name,
      email: createUserDto.email,
      password: createUserDto.password,
      isDude: createUserDto.isDude ?? false,
    });

    const savedUser = await this.usersRepository.save(newUser);
    return savedUser.id;
  }

  async updateUser(id: number, updateUserDto: UpdateUserDto): Promise<string> {
    await this.usersRepository.update(id, updateUserDto);
    return "User with id: " + id + " updated";
  }

  async deleteUser(id: number): Promise<string> {
    const result = await this.usersRepository.delete(id);
    if (result.affected === 0) {
      throw new Error("User not found");
    }

    return "User with id: " + id + " deleted";
  }
}
