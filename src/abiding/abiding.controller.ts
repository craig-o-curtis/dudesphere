import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import type { AuthUser } from "../auth/auth-user.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
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

  // The caller's own abidings. The user id comes from the JWT token in the
  // Authorization header, never from the URL, so a user can only ever fetch
  // their own. Must come before @Get(":id"), or "me" would be parsed as that
  // id — see UsersController's deleteMe, which has the same ordering reason.
  //
  // Auth flow:
  //   1. Frontend calls POST /auth/login with email + password.
  //   2. Backend validates credentials and returns a signed JWT token.
  //   3. Frontend stores the token and sends it on every protected request:
  //        Authorization: Bearer <token>
  //   4. JwtAuthGuard extracts the token, verifies its signature and expiry,
  //      then populates request.user with { userId, username, role }.
  //   5. @CurrentUser() reads that user object from the request.
  @Get("me")
  @UseGuards(JwtAuthGuard)
  public async getMyAbidings(@CurrentUser() user: AuthUser): Promise<AbidingResponseDto[]> {
    const abidings = await this.abidingService.getAbidingsByUserId(user.userId);
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

  @Get(":id")
  public async getAbidingById(@Param("id") id: string): Promise<AbidingResponseDto> {
    const abiding = await this.abidingService.getAbidingById(id);
    const [author] = await this.usersService.getUsersByIds([abiding.userId]);
    return new AbidingResponseDto({
      id: abiding.id,
      userId: abiding.userId,
      message: abiding.message,
      createdAt: abiding.createdAt,
      replyToId: abiding.replyToId ?? null,
      username: author?.username || "Unknown",
    });
  }

  @Post()
  public async postAbiding(
    @Body() createAbidingDto: CreateAbidingDto,
  ): Promise<AbidingResponseDto> {
    const newAbiding = await this.abidingService.createAbiding(createAbidingDto);
    const [author] = await this.usersService.getUsersByIds([newAbiding.userId]);
    return new AbidingResponseDto({
      id: newAbiding.id,
      userId: newAbiding.userId,
      message: newAbiding.message,
      createdAt: newAbiding.createdAt,
      replyToId: newAbiding.replyToId ?? null,
      username: author?.username || "Unknown",
    });
  }

  @Patch(":id")
  public async patchAbiding(
    @Param("id") id: string,
    @Body() updateAbidingDto: UpdateAbidingDto,
  ): Promise<AbidingResponseDto> {
    const updatedAbiding = await this.abidingService.patchAbiding(id, updateAbidingDto);
    const [author] = await this.usersService.getUsersByIds([updatedAbiding.userId]);
    return new AbidingResponseDto({
      id: updatedAbiding.id,
      userId: updatedAbiding.userId,
      message: updatedAbiding.message,
      createdAt: updatedAbiding.createdAt,
      replyToId: updatedAbiding.replyToId ?? null,
      username: author?.username || "Unknown",
    });
  }

  @Delete(":id")
  async deleteAbiding(@Param("id") id: string): Promise<void> {
    await this.abidingService.deleteAbiding(id);
  }
}
