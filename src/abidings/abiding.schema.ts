import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { maxLength } from "class-validator";
import { Document } from "mongoose";

export type AbidingDocument = Abiding & Document;

/** The longest message an abiding may carry. The DTOs and the schema share it. */
export const ABIDING_MESSAGE_MAX = 280;

@Schema({ timestamps: true })
export class Abiding extends Document {
  @Prop({ type: Number, required: true }) // FK to User.id, not MongoDB ObjectId
  userId: number;

  @Prop({
    type: String,
    required: true,
    minlength: [1, "Message must be at least 1 character"],
    // Not Mongoose's own `maxlength`. That counts UTF-16 units, so one emoji
    // counts as two and a red heart (U+2764 U+FE0F) as two as well, while the
    // DTO's @MaxLength counts each of them as one. A message the DTO accepted
    // then failed here as a 500. Calling the same function the DTO uses means
    // the two can never disagree.
    //
    // The function reads only `value`. On an edit Mongoose calls it with
    // `this` set to the query, not the document.
    validate: {
      validator: (value: string) => maxLength(value, ABIDING_MESSAGE_MAX),
      message: `Message cannot exceed ${ABIDING_MESSAGE_MAX} characters`,
    },
  })
  message: string;

  // image url
  @Prop({ type: String, default: null })
  imageUrl: string | null;

  // Optional reply chain — reference to parent abiding (MongoDB ObjectId)
  @Prop({ type: String, default: null })
  replyToId: string | null;

  // Optional username snapshot (so replies still show original author)
  @Prop({ type: String, default: null })
  username: string | null;

  // Normalized slugs derived from `message` by extractHashtags. Never set
  // directly by a client: neither abiding DTO has a `hashtags` field, and the
  // service writes this array itself. This array is the link between an
  // abiding and its tags; context/overview.md says why there is no join table.
  @Prop({ type: [String], default: [] })
  hashtags: string[];

  // Added by Mongoose timestamps: true — converted to ISO strings by schema getters
  createdAt: string | null;
  updatedAt: string | null;

  // Soft delete, stored as a UTC ISO 8601 string. Set when the author's user is
  // soft-deleted, cleared when they are restored. Reads filter on
  // `deletedAt: null`, which also matches older documents that have no
  // deletedAt field at all.
  @Prop({ type: String, default: null })
  deletedAt: string | null;
}

export const AbidingSchema = SchemaFactory.createForClass(Abiding);

// Indexes
// also serves the soft delete and restore of a user's abidings
AbidingSchema.index({ userId: 1 });
AbidingSchema.index({ replyToId: 1 });
// get latest abidings for a user
AbidingSchema.index({ userId: 1, createdAt: -1 });
// get latest abidings
AbidingSchema.index({ createdAt: -1 });
// get latest abidings for a hashtag — the query this feature exists to serve
AbidingSchema.index({ hashtags: 1, createdAt: -1 });
// get a user's abidings for a hashtag
AbidingSchema.index({ userId: 1, hashtags: 1 });

// Convert Mongoose Date getters to ISO strings (no JS Date objects in app code)
AbidingSchema.path("createdAt").get(function (this: AbidingDocument, v: Date) {
  return v?.toISOString() ?? null;
});
AbidingSchema.path("updatedAt").get(function (this: AbidingDocument, v: Date) {
  return v?.toISOString() ?? null;
});
