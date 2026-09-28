import {
  Param,
  Controller,
  Delete,
  Get,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  DefaultValuePipe,
  Body,
  ParseBoolPipe,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { CreateUserDto } from "./dto/create-user.dto.js";
import { UpdateUserDto } from "./dto/update-user.dto.js";
import { UserResponseDto } from "./dto/user-response.dto.js";
import { UsersService } from "./users.service.js";

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  getUsers(
    @Query("limit", new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("isDude") isDude?: string,
  ) {
    if (isDude === "true") {
      return this.usersService.getDudes(limit, page);
    }
    if (isDude === "false") {
      return this.usersService.getNonDudes(limit, page);
    }
    return this.usersService.getUsers(limit, page);
  }

  @Get(":id")
  async getUserById(@Param("id", ParseIntPipe) id: number): Promise<UserResponseDto> {
    return this.usersService.getUserById(id);
  }

  @Post()
  async createUser(@Body() createUserDto: CreateUserDto): Promise<number> {
    return this.usersService.createUser(createUserDto);
  }

  @Patch(":id")
  async updateUser(
    @Param("id", ParseIntPipe) id: number,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<string> {
    return this.usersService.updateUser(id, updateUserDto);
  }

  @Delete(":id")
  async deleteUser(@Param("id", ParseIntPipe) id: number): Promise<string> {
    return this.usersService.deleteUser(id);
  }
}
