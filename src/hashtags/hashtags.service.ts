import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { getUtcNow } from "@northguild/gmt";
import { Model } from "mongoose";

import { ErrorCode } from "../shared/error-codes.js";
import { normalizeHashtag } from "../shared/utils/hashtag.js";
import { HashtagResponseDto } from "./dto/hashtag-response.dto.js";
import { Hashtag, HashtagDocument } from "./hashtag.schema.js";

@Injectable()
export class HashtagsService {
  private readonly logger = new Logger(HashtagsService.name);

  constructor(@InjectModel(Hashtag.name) private readonly hashtagModel: Model<HashtagDocument>) {}

  // Every live hashtag, alphabetically — the list a tag dropdown or an
  // autocomplete reads. Served by the unique index on slug, not by scanning
  // abidings.
  //
  // deletedAt: null leaves out tags an admin has deleted. It also matches
  // registry rows written before the field existed, which have no deletedAt at
  // all, so those needed no backfill.
  async listAll(): Promise<HashtagResponseDto[]> {
    const hashtags = await this.hashtagModel.find({ deletedAt: null }).sort({ slug: 1 }).exec();
    return hashtags.map((hashtag) => this.toResponseDto(hashtag));
  }

  async getBySlug(slug: string): Promise<HashtagResponseDto | null> {
    const normalized = normalizeHashtag(slug);
    if (!normalized) {
      return null;
    }

    // deletedAt: null so a deleted tag reads as not found, the same as one
    // that never existed.
    const hashtag = await this.hashtagModel.findOne({ slug: normalized, deletedAt: null }).exec();
    return hashtag ? this.toResponseDto(hashtag) : null;
  }

  // Adds any tag that isn't in the registry yet. Called by AbidingsService
  // whenever it derives hashtags from a message, so the registry fills up as
  // a side effect of posting rather than needing its own write endpoint.
  //
  // It never brings back a tag an admin deleted; only restoreBySlug does.
  // See the comment on the write below.
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
      //
      // The same rule is what keeps a deleted tag deleted. Its row is still
      // there with deletedAt set, the filter matches it, and $setOnInsert
      // writes nothing to a row that exists. So posting with a deleted tag
      // does not put it back on the list, and neither does the backfill,
      // which re-registers every tag every abiding carries.
      //
      // That depends on two things staying as they are. The filter must be
      // { slug } alone: narrowed to live tags, the upsert would try to insert
      // a second row for a deleted slug and the unique index would reject it
      // on every reuse. And nothing here may $set deletedAt, or every post
      // with a deleted tag would undo the delete.
      await this.hashtagModel.bulkWrite(
        slugs.map((slug) => ({
          updateOne: {
            filter: { slug },
            update: {
              $setOnInsert: { slug, display: displays.get(slug) ?? slug, firstUsedAt },
            },
            // Creates the row when the slug is new. A row that exists, live
            // or deleted, is matched and left untouched.
            upsert: true,
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

  // Soft delete: stamps deletedAt and keeps the row. The row has to stay.
  // It is what stops the tag coming back: registerTags finds it and inserts
  // nothing. Remove the row instead and the next abiding to use the tag
  // would register it again as if it were new.
  //
  // Unlike registerTags, nothing here is swallowed. That method is a side
  // effect of posting; this one is the thing the caller asked for, so a
  // failure has to reach them.
  async deleteBySlug(slug: string): Promise<void> {
    const normalized = normalizeHashtag(slug);
    if (!normalized) throw new NotFoundException("Hashtag not found");

    // getUtcNow returns "" on failure. Throwing beats hiding the tag behind a
    // blank timestamp, which is how UserAbidingsService treats the same case.
    const deletedAt = getUtcNow();
    if (!deletedAt) {
      throw new ServiceUnavailableException("Could not read the current UTC time", {
        errorCode: ErrorCode.CLOCK_UNAVAILABLE, // TODO install latest gmt and we can remove all of these CLOCK_UNAVAILABLE
      });
    }

    // deletedAt: null so a tag that is already deleted keeps its first
    // timestamp, and deleting it a second time is a 404.
    const result = await this.hashtagModel
      .updateOne({ slug: normalized, deletedAt: null }, { $set: { deletedAt } })
      .exec();
    if (result.matchedCount === 0) throw new NotFoundException("Hashtag not found");
  }

  // The reverse of deleteBySlug, and the only thing that brings a deleted tag
  // back. Posting with the tag does not; see registerTags.
  //
  // The row was kept, so the tag returns with the casing and first-used date
  // it had before the delete.
  async restoreBySlug(slug: string): Promise<HashtagResponseDto> {
    const normalized = normalizeHashtag(slug);
    if (!normalized) throw new NotFoundException("Deleted hashtag not found");

    // $ne: null so only a deleted tag can be restored. A live or missing tag
    // is a 404, matching UsersService.restoreUser. It also leaves out rows
    // written before deletedAt existed, which Mongo treats as null.
    //
    // findOneAndUpdate, so the restore and the read of the restored row are
    // one operation. returnDocument: "after" returns the row as it is now.
    const restored = await this.hashtagModel
      .findOneAndUpdate(
        { slug: normalized, deletedAt: { $ne: null } },
        { $set: { deletedAt: null } },
        { returnDocument: "after" },
      )
      .exec();
    if (!restored) throw new NotFoundException("Deleted hashtag not found");

    return this.toResponseDto(restored);
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
