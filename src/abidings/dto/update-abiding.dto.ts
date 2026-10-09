import { IsOptional, IsString, IsUrl, MaxLength, MinLength } from "class-validator";

import { ABIDING_MESSAGE_MAX } from "../abiding.schema.js";

export class UpdateAbidingDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(ABIDING_MESSAGE_MAX)
  message?: string;

  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  replyToId?: string;
}
