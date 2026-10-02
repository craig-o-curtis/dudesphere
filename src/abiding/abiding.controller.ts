import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";

import { UsersService } from "../users/users.service.js";
import { AbidingService } from "./abiding.service.js";
import { AbidingResponseDto } from "./dto/abiding-response.dto.js";
import { CreateAbidingDto } from "./dto/create-abiding.dto.js";
import { UpdateAbidingDto } from "./dto/update-abiding.dto.js";

@Controller("abidings")
export class AbidingController {
  constructor(
    private readonly abidingService: AbidingService,
    private readonly usersService: UsersService,
  ) {}

  @Get()
  public async getAbidings(@Query("userId") userId?: number): Promise<AbidingResponseDto[]> {
    const abidings = await this.abidingService.getAbidings(userId);
    const authorIds = [...new Set(abidings.map((a) => a.userId))];
    const users = await this.usersService.getUsersByIds(authorIds);
    const usernames = new Map(users.map((u) => [u.id, u.username]));

    return abidings.map(
      (a) =>
        new AbidingResponseDto({
          id: a.id,
          userId: a.userId,
          message: a.message,
          username: usernames.get(a.userId) || "Unknown",
          createdAt: a.createdAt || "",
          replyToId: a.replyToId ?? undefined,
        }),
    );
  }

  @Post()
  public async postAbiding(
    @Body() createAbidingDto: CreateAbidingDto,
  ): Promise<AbidingResponseDto> {
    const newAbiding = await this.abidingService.createAbiding(createAbidingDto);
    const users = await this.usersService.getUsers();
    return new AbidingResponseDto({
      id: newAbiding.id,
      userId: newAbiding.userId,
      message: newAbiding.message,
      createdAt: newAbiding.createdAt,
      replyToId: newAbiding.replyToId ?? null,
      username: users.find((u) => u.id === newAbiding.userId)?.username || "Unknown",
    });
  }

  @Patch(":id")
  public async patchAbiding(
    @Param("id") id: string,
    @Body() updateAbidingDto: UpdateAbidingDto,
  ): Promise<AbidingResponseDto> {
    const updatedAbiding = await this.abidingService.patchAbiding(id, updateAbidingDto);
    const users = await this.usersService.getUsers();
    return new AbidingResponseDto({
      id: updatedAbiding.id,
      userId: updatedAbiding.userId,
      message: updatedAbiding.message,
      createdAt: updatedAbiding.createdAt,
      replyToId: updatedAbiding.replyToId ?? null,
      username: users.find((u) => u.id === updatedAbiding.userId)?.username || "Unknown",
    });
  }

  @Delete(":id")
  async deleteAbiding(@Param("id") id: string): Promise<void> {
    await this.abidingService.deleteAbiding(id);
  }
}
