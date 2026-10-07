import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { getUtcNow } from "@northguild/gmt";
import { Model } from "mongoose";

import { normalizeHashtag } from "../shared/utils/hashtag.js";
import { HashtagResponseDto } from "./dto/hashtag-response.dto.js";
import { Hashtag, HashtagDocument } from "./hashtag.schema.js";

@Injectable()
export class HashtagsService {
  private readonly logger = new Logger(HashtagsService.name);

  constructor(@InjectModel(Hashtag.name) private readonly hashtagModel: Model<HashtagDocument>) {}

  // Every hashtag ever used, alphabetically — the list a tag dropdown or an
  // autocomplete reads. Served by the unique index on slug, not by scanning
  // abidings.
  async listAll(): Promise<HashtagResponseDto[]> {
    const hashtags = await this.hashtagModel.find().sort({ slug: 1 }).exec();
    return hashtags.map((hashtag) => this.toResponseDto(hashtag));
  }

  async getBySlug(slug: string): Promise<HashtagResponseDto | null> {
    const normalized = normalizeHashtag(slug);
    if (!normalized) {
      return null;
    }

    const hashtag = await this.hashtagModel.findOne({ slug: normalized }).exec();
    return hashtag ? this.toResponseDto(hashtag) : null;
  }

  // Adds any tag that isn't in the registry yet. Called by AbidingsService
  // whenever it derives hashtags from a message, so the registry fills up as
  // a side effect of posting rather than needing its own write endpoint.
  //
  // `displays` maps each normalized slug to the casing it was written with,
  // as returned by extractHashtagDisplays. One argument rather than a slug
  // array plus a casing map, so the two can't disagree.
  //
  // This is a separate write from the abiding itself, not part of a
  // transaction — a multi-document Mongo transaction needs a replica set,
  // which this project's single-node Docker setup doesn't run. So if the
  // abiding is written and this fails, the abiding carries a tag the registry
  // doesn't list yet. That heals the next time anyone uses the tag, and the
  // backfill script repairs it in bulk. Nothing reads the registry to decide
  // what an abiding says, so the abiding is never wrong — only the dropdown
  // is briefly short an entry.
  //
  // Every failure here is logged and swallowed, including a failed clock
  // read. Registering a tag is a side effect of posting, and no failure in
  // it should cost the user their abiding.
  async registerTags(displays: Map<string, string>): Promise<void> {
    const slugs = [...displays.keys()];
    if (slugs.length === 0) {
      return;
    }

    // getUtcNow returns "" on failure, and firstUsedAt is required, so a
    // blank would write an invalid row. Skip the write instead.
    const firstUsedAt = getUtcNow();
    if (!firstUsedAt) {
      this.logger.error("Could not read the current UTC time — skipped registering hashtags");
      return;
    }

    try {
      // $setOnInsert only, so a tag that already exists is left exactly as it
      // was: the first casing and the first date win. upsert makes each of
      // these a single atomic operation on one document, so two abidings
      // using a new tag at the same time can't create two rows — the unique
      // index on slug settles it.
      await this.hashtagModel.bulkWrite(
        slugs.map((slug) => ({
          updateOne: {
            filter: { slug },
            update: {
              $setOnInsert: { slug, display: displays.get(slug) ?? slug, firstUsedAt },
            },
            upsert: true, // upsert means if the document doesn't exist, it will be created, but if exists it will not be modified due to $setOnInsert
          },
        })),
      );
    } catch (error) {
      this.logger.error(
        `Could not register hashtags: ${slugs.join(", ")}`,
        error instanceof Error ? error.stack : error,
      );
      // Swallowed on purpose. The abiding is already written and is the
      // record that matters; losing a registry row costs a dropdown entry
      // until the tag is used again, and is not worth failing the post over.
    }
  }

  async deleteBySlug(slug: string): Promise<void> {
    const normalized = normalizeHashtag(slug);
    if (!normalized) throw new NotFoundException("Hashtag not found");

    const result = await this.hashtagModel.deleteOne({ slug: normalized }).exec();
    if (result.deletedCount === 0) throw new NotFoundException("Hashtag not found");
  }

  // --- Private helpers ---

  private toResponseDto(hashtag: HashtagDocument): HashtagResponseDto {
    return new HashtagResponseDto({
      slug: hashtag.slug,
      display: hashtag.display,
      firstUsedAt: hashtag.firstUsedAt,
    });
  }
}
