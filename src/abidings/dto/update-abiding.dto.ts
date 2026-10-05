import { IsOptional, IsString, IsUrl, MaxLength, MinLength } from "class-validator";

export class UpdateAbidingDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(280)
  message?: string;

  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  replyToId?: string;
}
