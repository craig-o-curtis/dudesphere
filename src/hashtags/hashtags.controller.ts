import { Controller, Delete, Get, HttpCode, NotFoundException, Param, Post } from "@nestjs/common";

import { Public } from "../shared/decorators/public.decorator.js";
import { Roles } from "../shared/decorators/roles.decorator.js";
import { UserRole } from "../users/user.entity.js";
import { HashtagResponseDto } from "./dto/hashtag-response.dto.js";
import { HashtagsService } from "./hashtags.service.js";

@Controller("hashtags")
export class HashtagsController {
  constructor(private readonly hashtagsService: HashtagsService) {}

  // Every hashtag ever used, alphabetically. This is the dropdown and
  // autocomplete source. To then fetch the abidings for one of them, call
  // GET /abidings?hashtag=<slug>.
  @Public()
  @Get()
  public async getHashtags(): Promise<HashtagResponseDto[]> {
    return this.hashtagsService.listAll();
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
  @Roles(UserRole.ADMIN)
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
  @Roles(UserRole.ADMIN)
  @Post(":slug/restore")
  @HttpCode(200) // uses 200 OK instead of Nest default 201 Created
  public async restoreHashtagBySlug(@Param("slug") slug: string): Promise<HashtagResponseDto> {
    return this.hashtagsService.restoreBySlug(slug);
  }
}
