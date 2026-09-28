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
    const users = await this.usersService.getUsers();
    const abidings = await this.abidingService.getAbidings(userId);
    return abidings.map(
      (a) =>
        new AbidingResponseDto({
          id: a.id,
          userId: a.userId,
          message: a.message,
          userName: users.find((u) => u.id === a.userId)?.name || "Unknown",
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
      userName: users.find((u) => u.id === newAbiding.userId)?.name || "Unknown",
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
      userName: users.find((u) => u.id === updatedAbiding.userId)?.name || "Unknown",
    });
  }

  @Delete(":id")
  async deleteAbiding(@Param("id") id: string): Promise<void> {
    await this.abidingService.deleteAbiding(id);
  }
}
