import {
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from "class-validator";

import { ABIDING_MESSAGE_MAX } from "../abiding.schema.js";

export class CreateAbidingDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  // The schema applies the same limit with the same function. See the
  // comment on `message` in abiding.schema.ts.
  @MaxLength(ABIDING_MESSAGE_MAX)
  message: string;

  @IsUrl()
  @IsOptional()
  imageUrl?: string | null;

  // No userId. The author is the caller, read from the verified token in
  // AbidingsService.createAbiding. Because ValidationPipe runs with
  // forbidNonWhitelisted, a client still sending one gets a 400 rather than
  // having it quietly ignored.

  // The id of the abiding this one replies to. @IsMongoId checks the shape
  // only. AbidingsService checks that it names a live abiding, because that
  // needs the database.
  @IsOptional()
  @IsMongoId()
  replyToId?: string | null;
}
