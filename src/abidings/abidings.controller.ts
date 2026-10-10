import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import { ParseObjectIdPipe } from "@nestjs/mongoose";
import type { Types as MongooseTypes } from "mongoose";

import type { AuthUser } from "../auth/auth-user.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { Public } from "../shared/decorators/public.decorator.js";
import {
  type PageRequest,
  type PaginatedResponse,
  toPaginatedResponse,
} from "../shared/dto/paginated-response.js";
import { PaginationQueryDto } from "../shared/dto/pagination-query.dto.js";
import { splitCommaSeparated } from "../shared/utils/comma-separated.js";
import { AbidingsService } from "./abidings.service.js";
import { AbidingResponseDto } from "./dto/abiding-response.dto.js";
import { CreateAbidingDto } from "./dto/create-abiding.dto.js";
import { GetAbidingsDto } from "./dto/get-abidings.dto.js";
import { UpdateAbidingDto } from "./dto/update-abiding.dto.js";

// Every route here reads the request, calls AbidingsService and returns what
// it gets. The service returns each abiding as an AbidingResponseDto with its
// author's username already on it.
@Controller("abidings")
export class AbidingsController {
  constructor(private readonly abidingsService: AbidingsService) {}

  @Public()
  @Get()
  public async getAbidings(
    @Query() query: GetAbidingsDto,
  ): Promise<PaginatedResponse<AbidingResponseDto>> {
    // Already checked: GetAbidingsDto converts userId to a number and
    // validates the dates, so an unusable value is a 400 before it reaches
    // here.
    const { userId, startDate, endDate } = query;
    // Only limit and page go to the service as the page. The rest are filters.
    const pageRequest: PageRequest = { limit: query.limit, page: query.page };
    // Reading a comma-separated query param is this layer's job. What the
    // tags mean, and which query they need, is the service's.
    const tags = query.hashtag ? splitCommaSeparated(query.hashtag) : [];

    const abidings = await this.abidingsService.getAbidings(pageRequest, {
      userId,
      startDate,
      endDate,
      hashtags: tags,
    });
    // The links carry the tags as they were parsed, not as they were sent. A
    // param of only commas was treated as no filter, so its links have none.
    return toPaginatedResponse(abidings, pageRequest, "/abidings", {
      userId,
      startDate,
      endDate,
      hashtag: tags.length > 0 ? tags.join(",") : undefined,
    });
  }

  // The caller's own abidings. The user id comes from the JWT token in the
  // Authorization header, never from the URL, so a user can only ever fetch
  // their own. Must come before @Get(":id"), or "me" would be parsed as that
  // id — see UsersController's deleteMe, which has the same ordering reason.
  //
  // Auth flow:
  //   1. Frontend calls POST /auth with email + password.
  //   2. Backend validates credentials and returns a signed JWT token.
  //   3. Frontend stores the token and sends it on every protected request:
  //        Authorization: Bearer <token>
  //   4. JwtAuthGuard extracts the token, verifies its signature and expiry,
  //      then populates request.user with { userId, username, role }.
  //   5. @CurrentUser() reads that user object from the request.
  @Get("me")
  public async getMyAbidings(
    @CurrentUser() user: AuthUser,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResponse<AbidingResponseDto>> {
    const myAbidings = await this.abidingsService.getAbidingsByUserId(user.userId, query);
    return toPaginatedResponse(myAbidings, query, "/abidings/me");
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
    return this.abidingsService.getAbidingById(id.toString());
  }

  @Post()
  public async postAbiding(
    @Body() createAbidingDto: CreateAbidingDto,
    @CurrentUser() user: AuthUser,
  ): Promise<AbidingResponseDto> {
    // The service also checks that the author still exists.
    return this.abidingsService.createAbiding(createAbidingDto, user);
  }

  // Author or admin. The service enforces it, in the same filter as the write.
  @Patch(":id")
  public async patchAbiding(
    @Param("id", ParseObjectIdPipe) id: MongooseTypes.ObjectId,
    @Body() updateAbidingDto: UpdateAbidingDto,
    @CurrentUser() user: AuthUser,
  ): Promise<AbidingResponseDto> {
    return this.abidingsService.patchAbiding(id.toString(), updateAbidingDto, user);
  }

  // Author or admin, same rule as PATCH above.
  @Delete(":id")
  @HttpCode(204) // needs 204 No Content instead of default 200 OK
  async deleteAbiding(
    @Param("id", ParseObjectIdPipe) id: MongooseTypes.ObjectId,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.abidingsService.deleteAbiding(id.toString(), user);
  }
}
