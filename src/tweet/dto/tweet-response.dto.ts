import { Expose, Transform } from "class-transformer";

export class TweetResponseDto {
  @Expose()
  id: number;

  @Expose()
  userId: number;

  @Expose()
  message: string;

  @Expose()
  userName?: string;

  @Expose()
  @Transform(({ obj }) => obj.replyToId || null)
  replyToId?: number | null;

  @Expose()
  @Transform(({ obj }) => (obj.createdAt ? obj.createdAt : null))
  createdAt: string | null;

  constructor(partial: Partial<TweetResponseDto>) {
    Object.assign(this, partial);
  }
}
