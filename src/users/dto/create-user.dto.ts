import { Type } from "class-transformer";
import {
  IsByteLength,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateNested,
} from "class-validator";

import { CreateProfileDto } from "../../profiles/dto/create-profile-dto.js";
import { MaxCodePoints } from "../../shared/decorators/max-code-points.decorator.js";
import { NoNulCharacter } from "../../shared/decorators/no-nul-character.decorator.js";

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  // 24 to match the length CHECK on the column. A longer value used to pass
  // validation and then fail in Postgres as a 500. @MaxCodePoints, not
  // @MaxLength, because it counts the way the column does.
  @MaxCodePoints(24)
  @NoNulCharacter()
  // No "@": login takes a username or an email in one field and tells them
  // apart by the "@". A username that held one could be someone else's email
  // address. No whitespace: login trims what the caller typed, so a username
  // with a space at either end could never be matched.
  @Matches(/^[^\s@]+$/, { message: "username must not contain spaces or @" })
  username: string;

  @IsString()
  @IsNotEmpty()
  @IsEmail()
  @MaxCodePoints(100)
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  // 72 bytes, not characters, because that is all bcrypt reads: anything past
  // it would be ignored, so two long passwords with the same first 72 bytes
  // would both log in. An accented letter is 2 bytes and an emoji is 4.
  @IsByteLength(0, 72, {
    message: "password is too long: at most 72 letters or digits, fewer with accents or emoji",
  })
  password: string;

  // Optional. A profile is always created; these are its starting values.
  // @ValidateNested + @Type are BOTH needed for the nested fields to be validated.
  // NOTE - the confusing here is that on teh actual User table, the profile is a relation, not a column.
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateProfileDto)
  profile?: CreateProfileDto;
}
