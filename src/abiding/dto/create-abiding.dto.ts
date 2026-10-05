import { IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength, MinLength } from "class-validator";

export class CreateAbidingDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(280)
  message: string;

  @IsUrl()
  @IsOptional()
  imageUrl?: string;

  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsOptional()
  @IsString()
  replyToId?: string;
}
