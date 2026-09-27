import { Expose, Transform } from "class-transformer";

export class TweetResponseDto {
  @Expose()
  id: string;

  @Expose()
  userId: number;

  @Expose()
  message: string;

  @Expose()
  userName?: string | null;

  @Expose()
  @Transform(({ obj }) => obj.replyToId || null)
  replyToId?: string | null;

  @Expose()
  @Transform(({ obj }) => (obj.createdAt ? obj.createdAt : null))
  createdAt: string | null;

  constructor(partial: Partial<TweetResponseDto>) {
    Object.assign(this, partial);
  }
}
