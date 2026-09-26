import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class UpdateTweetDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(280)
  message?: string;

  @IsOptional()
  @IsString()
  replyToId?: string;
}
