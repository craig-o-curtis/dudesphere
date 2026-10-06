import { IsOptional, IsString } from "class-validator";

export class ListAbidingsQueryDto {
  @IsOptional()
  @IsString()
  userId?: string;

  // One tag, or several comma-separated ("dude,sunday") matched with OR —
  // an abiding needs only one of them. Each is accepted with or without a
  // leading # and normalized by the service before it reaches Mongo. See
  // src/shared/utils/hashtag.ts.
  @IsOptional()
  @IsString()
  hashtag?: string;
}
