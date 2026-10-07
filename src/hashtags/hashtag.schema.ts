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
// Rows are created by HashtagsService.registerTags and never deleted. A tag
// outlives the abidings that used it, the same way a hashtag page on Twitter
// survives the deletion of every tweet on it.
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

  // TODO setup for soft delete
  // TODO just added this so see how to `migrate` this change, document in DEVELOPMENT.md
  @Prop({ type: String, default: null })
  deletedAt: string | null;
}

export const HashtagSchema = SchemaFactory.createForClass(Hashtag);

// Indexes
// `unique: true` on slug already creates the index that serves lookup by tag
// and the alphabetical listing for a dropdown.
