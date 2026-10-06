import { Controller, Get, NotFoundException, Param } from "@nestjs/common";

import { HashtagResponseDto } from "./dto/hashtag-response.dto.js";
import { HashtagsService } from "./hashtags.service.js";

@Controller("hashtags")
export class HashtagsController {
  constructor(private readonly hashtagsService: HashtagsService) {}

  // Every hashtag ever used, alphabetically. This is the dropdown and
  // autocomplete source. To then fetch the abidings for one of them, call
  // GET /abidings?hashtag=<slug>.
  @Get()
  public async getHashtags(): Promise<HashtagResponseDto[]> {
    return this.hashtagsService.listAll();
  }

  @Get(":slug")
  public async getHashtagBySlug(@Param("slug") slug: string): Promise<HashtagResponseDto> {
    const hashtag = await this.hashtagsService.getBySlug(slug);
    if (!hashtag) {
      throw new NotFoundException("Hashtag not found");
    }
    return hashtag;
  }
}
