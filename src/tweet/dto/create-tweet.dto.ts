import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateTweetDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(280)
  message: string;

  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsOptional()
  @IsString()
  replyToId?: string;
}
