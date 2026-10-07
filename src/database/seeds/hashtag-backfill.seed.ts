import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";

import { Abiding, AbidingDocument } from "../../abidings/abiding.schema.js";
import { HashtagsService } from "../../hashtags/hashtags.service.js";
import { extractHashtagDisplays, extractHashtags } from "../../shared/utils/hashtag.js";

export type HashtagBackfillResult = {
  abidings: number;
  tags: number;
};

// Re-derives `hashtags` on every abiding from its `message`, then registers
// every tag it found. Run by `pnpm backfill:hashtags` — see DEVELOPMENT.md for
// when that is needed.
//
// Safe to run as many times as you like. It re-derives from `message` rather
// than checking whether `hashtags` is already set, so an abiding that is
// already correct is rewritten to the same value, and registerTags upserts
// with $setOnInsert so a tag that already exists is left exactly as it is —
// including one an admin has deleted, which stays deleted.
@Injectable()
export class HashtagBackfillService {
  private readonly logger = new Logger(HashtagBackfillService.name);

  constructor(
    @InjectModel(Abiding.name) private readonly abidingModel: Model<AbidingDocument>,
    private readonly hashtagsService: HashtagsService,
  ) {}

  async backfill(): Promise<HashtagBackfillResult> {
    // A cursor, not find().exec(), so the whole collection is never held in
    // memory at once. Only `message` is projected, since that is all the
    // derivation needs.
    const cursor = this.abidingModel.find({}, { message: 1 }).cursor();

    let abidings = 0;
    // Accumulated across every abiding and registered in one pass at the end,
    // so a tag used by a thousand abidings is upserted once rather than a
    // thousand times. First casing seen wins, matching registerTags.
    const displays = new Map<string, string>();

    for await (const doc of cursor) {
      await this.abidingModel
        .updateOne({ _id: doc._id }, { $set: { hashtags: extractHashtags(doc.message) } })
        .exec();

      for (const [slug, display] of extractHashtagDisplays(doc.message)) {
        if (!displays.has(slug)) {
          displays.set(slug, display);
        }
      }

      abidings += 1;
    }

    // Repairs the registry as well as the abidings: any tag missing from it,
    // whether because it predates the registry or because a live upsert
    // failed, is added here.
    //
    // Abidings keep a deleted tag in their hashtags array, so `displays` holds
    // every tag an admin ever deleted. registerTags leaves those deleted.
    await this.hashtagsService.registerTags(displays);

    this.logger.log(`Backfilled ${abidings} abidings, registered ${displays.size} tags`);

    return { abidings, tags: displays.size };
  }
}
