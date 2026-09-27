import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type TweetDocument = Tweet & Document;

@Schema({ timestamps: true })
export class Tweet extends Document {
  @Prop({ required: true })
  userId: number;

  @Prop({
    required: true,
    minlength: [1, "Message must be at least 1 character"],
    maxlength: [280, "Message cannot exceed 280 characters"],
  })
  message: string;

  // Optional reply chain — reference to parent tweet (MongoDB ObjectId)
  @Prop({ type: String, default: null })
  replyToId: string | null;

  // Optional username snapshot (so replies still show original author)
  @Prop({ type: String, default: null })
  userName: string | null;

  // Flexible media — optional images, links, etc.
  @Prop([{ type: String }])
  images?: string[];

  @Prop([{ type: String }])
  links?: string[];

  // Added by Mongoose timestamps: true — converted to ISO strings by schema getters
  createdAt: string | null;
  updatedAt: string | null;
}

export const TweetSchema = SchemaFactory.createForClass(Tweet);

// Convert Mongoose Date getters to ISO strings (no JS Date objects in app code)
TweetSchema.path("createdAt").get(function (this: TweetDocument, v: Date) {
  return v?.toISOString() ?? null;
});
TweetSchema.path("updatedAt").get(function (this: TweetDocument, v: Date) {
  return v?.toISOString() ?? null;
});
