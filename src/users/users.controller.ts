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
} from "@nestjs/common";

import { CreateUserDto } from "./dto/create-user.dto.js";
import { UpdateUserDto } from "./dto/update-user.dto.js";
import { UsersService } from "./users.service.js";

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  getUsers(
    @Query("limit", new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("isDude", new DefaultValuePipe(false), ParseBoolPipe) isDude: boolean,
  ) {
    // if has boolean for isDude, then call the other service methods
    if (typeof isDude !== "boolean") {
      return this.usersService.getUsers(limit, page);
    }
    if (isDude) {
      return this.usersService.getDudes(limit, page);
    }
    return this.usersService.getNonDudes(limit, page);
  }

  @Get(":id")
  getUserById(@Param("id", ParseIntPipe) id: number): unknown {
    return this.usersService.getUserById(id);
  }

  @Post()
  createUser(@Body() createUserDto: CreateUserDto): number {
    return this.usersService.createUser(createUserDto);
  }

  @Patch(":id")
  updateUser(@Param("id", ParseIntPipe) id: number, @Body() updateUserDto: UpdateUserDto): string {
    return this.usersService.updateUser(id, updateUserDto);
  }

  @Delete(":id")
  deleteUser(@Param("id", ParseIntPipe) id: number): string {
    return this.usersService.deleteUser(id);
  }
}
