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

  // No userId. The author is the caller, read from the verified token in
  // AbidingsService.createAbiding. Because ValidationPipe runs with
  // forbidNonWhitelisted, a client still sending one gets a 400 rather than
  // having it quietly ignored.

  @IsOptional()
  @IsString()
  replyToId?: string;
}
