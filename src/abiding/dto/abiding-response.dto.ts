import { Expose, Transform } from "class-transformer";

export class AbidingResponseDto {
  @Expose()
  id: string;

  @Expose()
  userId: number;

  @Expose()
  message: string;

  @Expose()
  imageUrl?: string | null;

  @Expose()
  username?: string | null;

  @Expose()
  @Transform(({ obj }) => obj.replyToId || null)
  replyToId?: string | null;

  @Expose()
  @Transform(({ obj }) => obj.createdAt)
  createdAt: string;

  @Expose()
  @Transform(({ obj }) => obj.updatedAt)
  updatedAt: string;

  constructor(partial: Partial<AbidingResponseDto>) {
    Object.assign(this, partial);
  }
}
