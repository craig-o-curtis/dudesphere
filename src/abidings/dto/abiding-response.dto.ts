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

  // Always an array in a response, never undefined — see the constructor.
  // Abidings written before this field existed have no `hashtags` at all.
  @Expose()
  hashtags: string[];

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
    // Defaulted here rather than with @Transform, because every caller builds
    // this with `new`, and class-transformer's decorators only run under
    // plainToInstance/instanceToPlain — so a @Transform default would never
    // fire on the request path.
    this.hashtags ??= [];
  }
}
