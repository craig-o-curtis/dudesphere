import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type HashtagDocument = Hashtag & Document;

// The canonical list of every hashtag that has ever been used.
//
// This is the "hashtag" side of the many-to-many between abidings and
// hashtags. The other side — which abidings carry which tags — is the
// `hashtags: string[]` array on the Abiding document. In a relational schema
// that relationship would need a third join table; here the array on Abiding
// is the join, which is why there are two collections and not three.
//
// This collection exists so a tag can be asked about on its own: list every
// tag for a dropdown, show its original casing, know when it first appeared.
// None of that is answerable from the Abiding array alone without scanning
// every abiding in the collection.
//
// Rows are created by HashtagsService.registerTags and are never removed. A
// tag outlives the abidings that used it, the same way a hashtag page on
// Twitter survives the deletion of every tweet on it.
//
// An admin can delete a tag, but that is a soft delete: deletedAt is set and
// the row stays. The reads leave it out, so it drops off the dropdown. It
// stays off: posting with the tag again does not bring it back, because the
// kept row stops registerTags from adding it a second time. Only an admin
// restoring it does, and it returns with its first casing and date.
//
// A delete does not cascade. Abidings keep the slug in their own hashtags
// array, so GET /abidings?hashtag=<slug> still finds them while
// GET /hashtags/<slug> is a 404. That is deliberate: reaching into abidings
// from here would make HashtagsModule depend on them.
@Schema()
export class Hashtag extends Document {
  // Normalized by extractHashtags/normalizeHashtag — the lookup key, and the
  // value stored in Abiding.hashtags. Unique, so the registry holds one row
  // per tag no matter how many abidings use it.
  @Prop({ type: String, required: true, unique: true })
  slug: string;

  // The casing the tag was first written with, for display: "#Sunday" rather
  // than "#sunday". Only ever set on insert, so the first use wins.
  @Prop({ type: String, required: true })
  display: string;

  // UTC ISO 8601 string, set once on insert. Not Mongoose `timestamps`,
  // because an upsert that finds an existing row must not touch it.
  @Prop({ type: String, required: true })
  firstUsedAt: string;

  // Soft delete, stored as a UTC ISO 8601 string. Null means the tag is live.
  // Set by HashtagsService.deleteBySlug and cleared only by restoreBySlug, so
  // a deleted tag stays deleted until an admin restores it.
  //
  // Rows written before this field existed have no deletedAt at all. Reads
  // filter on `deletedAt: null`, which Mongo also matches against a missing
  // field, so those rows count as live and needed no backfill. DEVELOPMENT.md
  // covers when a new Mongo field does need one.
  @Prop({ type: String, default: null })
  deletedAt: string | null;
}

export const HashtagSchema = SchemaFactory.createForClass(Hashtag);

// Indexes
// `unique: true` on slug already creates the index that serves lookup by tag
// and the alphabetical listing for a dropdown.
