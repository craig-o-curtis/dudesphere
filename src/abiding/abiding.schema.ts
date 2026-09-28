import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type AbidingDocument = Abiding & Document;

@Schema({ timestamps: true })
export class Abiding extends Document {
  @Prop({ required: true })
  userId: number;

  @Prop({
    required: true,
    minlength: [1, "Message must be at least 1 character"],
    maxlength: [280, "Message cannot exceed 280 characters"],
  })
  message: string;

  // Optional reply chain — reference to parent abiding (MongoDB ObjectId)
  @Prop({ type: String, default: null })
  replyToId: string | null;

  // Optional username snapshot (so replies still show original author)
  @Prop({ type: String, default: null })
  username: string | null;

  // Added by Mongoose timestamps: true — converted to ISO strings by schema getters
  createdAt: string | null;
  updatedAt: string | null;
}

export const AbidingSchema = SchemaFactory.createForClass(Abiding);

// Convert Mongoose Date getters to ISO strings (no JS Date objects in app code)
AbidingSchema.path("createdAt").get(function (this: AbidingDocument, v: Date) {
  return v?.toISOString() ?? null;
});
AbidingSchema.path("updatedAt").get(function (this: AbidingDocument, v: Date) {
  return v?.toISOString() ?? null;
});
