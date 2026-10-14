import { Public } from "@nestjs/authentication";
import { Can } from "@nestjs/authorization";
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
} from "@nestjs/common";

import { PaginationQueryDto } from "../shared/pagination/dto/pagination-query.dto.js";
import type { Paginated } from "../shared/pagination/paginated.interface.js";
import { PaginationProvider } from "../shared/pagination/pagination.provider.js";
import { HashtagResponseDto } from "./dto/hashtag-response.dto.js";
import { HashtagPolicy } from "./hashtag.policy.js";
import { HashtagsService } from "./hashtags.service.js";

@Controller("hashtags")
export class HashtagsController {
  constructor(
    private readonly hashtagsService: HashtagsService,
    private readonly paginationProvider: PaginationProvider,
  ) {}

  // The live hashtags, alphabetically, one page at a time. This is the
  // dropdown and autocomplete source. A caller that wants every tag asks for
  // ?limit=100 and follows links.next until it is null. To then fetch the
  // abidings for one of them, call GET /abidings?hashtag=<slug>.
  @Public()
  @Get()
  public async getHashtags(
    @Query() pageRequest: PaginationQueryDto,
  ): Promise<Paginated<HashtagResponseDto>> {
    const hashtags = await this.hashtagsService.list(pageRequest);
    return this.paginationProvider.toResponse(hashtags, pageRequest, "/hashtags");
  }

  @Public()
  @Get(":slug")
  public async getHashtagBySlug(@Param("slug") slug: string): Promise<HashtagResponseDto> {
    const hashtag = await this.hashtagsService.getBySlug(slug);
    if (!hashtag) {
      throw new NotFoundException("Hashtag not found");
    }
    return hashtag;
  }

  // Admin only: a tag is shared by every abiding that uses it, so removing one
  // is moderation rather than something its users do.
  //
  // There is deliberately no cascade. Abidings keep the slug in their
  // `hashtags` array and their message text still reads "#sunday", so
  // GET /abidings?hashtag=sunday keeps working while GET /hashtags/sunday is a
  // 404. Pulling the tag out of every abiding would make HashtagsModule depend
  // on abidings, inverting the direction UserAbidingsModule exists to keep —
  // see the comment on HashtagsModule.
  @Can(HashtagPolicy, "delete")
  @Delete(":slug")
  @HttpCode(204) // needs 204 No Content instead of default 200 OK
  public async deleteHashtagBySlug(@Param("slug") slug: string): Promise<void> {
    await this.hashtagsService.deleteBySlug(slug);
  }

  // Undoes the delete above. Admin only, like the delete, and the only way a
  // deleted tag comes back: posting with it again does not restore it.
  //
  // 200, not POST's default 201: this brings back an existing tag rather than
  // creating one. Same shape as POST /users/:id/restore.
  @Can(HashtagPolicy, "restore")
  @Post(":slug/restore")
  @HttpCode(200) // uses 200 OK instead of Nest default 201 Created
  public async restoreHashtagBySlug(@Param("slug") slug: string): Promise<HashtagResponseDto> {
    return this.hashtagsService.restoreBySlug(slug);
  }
}
