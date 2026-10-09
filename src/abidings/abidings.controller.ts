import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ParseObjectIdPipe } from "@nestjs/mongoose";
import type { Types as MongooseTypes } from "mongoose";

import type { AuthUser } from "../auth/auth-user.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { Public } from "../shared/decorators/public.decorator.js";
import { UsersService } from "../users/users.service.js";
import { AbidingsService } from "./abidings.service.js";
import { AbidingResponseDto } from "./dto/abiding-response.dto.js";
import { CreateAbidingDto } from "./dto/create-abiding.dto.js";
import { ListAbidingsQueryDto } from "./dto/list-abidings-query.dto.js";
import { UpdateAbidingDto } from "./dto/update-abiding.dto.js";

@Controller("abidings")
export class AbidingsController {
  constructor(
    private readonly AbidingsService: AbidingsService,
    private readonly usersService: UsersService,
  ) {}

  @Public()
  @Get()
  public async getAbidings(@Query() query: ListAbidingsQueryDto): Promise<AbidingResponseDto[]> {
    // Already a number: ListAbidingsQueryDto coerces and validates it, so an
    // unusable value is a 400 before it reaches here.
    const userId = query.userId;
    // Comma-separated, matched with OR — see ListAbidingsQueryDto. A single
    // tag still goes through the dedicated single-tag call rather than the
    // multi-tag one, since that's the call the rest of the service (and any
    // future caller) should reach for when it only has one tag.
    const tags = query.hashtag
      ? query.hashtag
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
      : [];

    const abidings =
      tags.length === 0
        ? await this.AbidingsService.getAbidings(userId)
        : tags.length === 1
          ? await this.AbidingsService.getAbidingsByHashtag(tags[0], userId)
          : await this.AbidingsService.getAbidingsByHashtags(tags, userId);
    const authorIds = [...new Set(abidings.map((a) => a.userId))];
    const users = await this.usersService.getUsersByIds(authorIds);
    const usernames = new Map(users.map((u) => [u.id, u.username]));

    return abidings.map(
      (a) =>
        new AbidingResponseDto({
          id: a.id,
          userId: a.userId,
          message: a.message,
          imageUrl: a.imageUrl ?? null,
          username: usernames.get(a.userId) || "Unknown",
          createdAt: a.createdAt || "",
          updatedAt: a.updatedAt || "",
          replyToId: a.replyToId ?? undefined,
          hashtags: a.hashtags,
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
  public async getMyAbidings(@CurrentUser() user: AuthUser): Promise<AbidingResponseDto[]> {
    const myAbidings = await this.AbidingsService.getAbidingsByUserId(user.userId);
    return myAbidings.map(
      (a) =>
        new AbidingResponseDto({
          id: a.id,
          userId: a.userId,
          message: a.message,
          imageUrl: a.imageUrl ?? null,
          username: user.username,
          createdAt: a.createdAt || "",
          updatedAt: a.updatedAt || "",
          replyToId: a.replyToId ?? undefined,
          hashtags: a.hashtags,
        }),
    );
  }

  @Public()
  @Get(":id")
  // ParseObjectIdPipe rejects anything that is not a 24-character hex id, so a
  // typo is a 400 here rather than a CastError and a 500 inside Mongoose. It
  // returns a Types.ObjectId, which is why the param is typed that way and the
  // service — which takes a string — is handed id.toString().
  public async getAbidingById(
    @Param("id", ParseObjectIdPipe) id: MongooseTypes.ObjectId,
  ): Promise<AbidingResponseDto> {
    const abiding = await this.AbidingsService.getAbidingById(id.toString());
    const [author] = await this.usersService.getUsersByIds([abiding.userId]);
    return new AbidingResponseDto({
      id: abiding.id,
      userId: abiding.userId,
      message: abiding.message,
      imageUrl: abiding.imageUrl ?? null,
      createdAt: abiding.createdAt,
      updatedAt: abiding.updatedAt,
      replyToId: abiding.replyToId ?? null,
      username: author?.username || "Unknown",
      hashtags: abiding.hashtags,
    });
  }

  @Post()
  public async postAbiding(
    @Body() createAbidingDto: CreateAbidingDto,
    @CurrentUser() user: AuthUser,
  ): Promise<AbidingResponseDto> {
    const newAbiding = await this.AbidingsService.createAbiding(createAbidingDto, user);
    const [author] = await this.usersService.getUsersByIds([newAbiding.userId]);
    return new AbidingResponseDto({
      id: newAbiding.id,
      userId: newAbiding.userId,
      message: newAbiding.message,
      imageUrl: newAbiding.imageUrl ?? null,
      createdAt: newAbiding.createdAt,
      updatedAt: newAbiding.updatedAt,
      replyToId: newAbiding.replyToId ?? null,
      username: author?.username || "Unknown",
      hashtags: newAbiding.hashtags,
    });
  }

  // Author or admin. The service enforces it, in the same filter as the write.
  @Patch(":id")
  public async patchAbiding(
    @Param("id", ParseObjectIdPipe) id: MongooseTypes.ObjectId,
    @Body() updateAbidingDto: UpdateAbidingDto,
    @CurrentUser() user: AuthUser,
  ): Promise<AbidingResponseDto> {
    const updatedAbiding = await this.AbidingsService.patchAbiding(
      id.toString(),
      updateAbidingDto,
      user,
    );
    const [author] = await this.usersService.getUsersByIds([updatedAbiding.userId]);
    return new AbidingResponseDto({
      id: updatedAbiding.id,
      userId: updatedAbiding.userId,
      message: updatedAbiding.message,
      imageUrl: updatedAbiding.imageUrl ?? null,
      createdAt: updatedAbiding.createdAt,
      updatedAt: updatedAbiding.updatedAt,
      replyToId: updatedAbiding.replyToId ?? null,
      username: author?.username || "Unknown",
      hashtags: updatedAbiding.hashtags,
    });
  }

  // Author or admin, same rule as PATCH above.
  @Delete(":id")
  async deleteAbiding(
    @Param("id", ParseObjectIdPipe) id: MongooseTypes.ObjectId,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.AbidingsService.deleteAbiding(id.toString(), user);
  }
}
