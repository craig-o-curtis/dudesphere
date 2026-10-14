import { Type } from "class-transformer";
import {
  IsDefined,
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
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
  // 128 characters at most, as in the NestJS docs. scrypt reads the whole
  // password, so there is no hidden cut-off as bcrypt's 72 bytes was. The
  // limit only keeps a request from making the server hash a huge string.
  @MaxLength(128)
  password: string;

  // Required, because a profile's displayName is. A profile is always
  // created; these are its starting values.
  // @IsDefined is needed for "required": @ValidateNested alone skips a missing
  // object. @ValidateNested + @Type are BOTH needed for the nested fields to be validated.
  // NOTE - the confusing here is that on teh actual User table, the profile is a relation, not a column.
  @IsDefined()
  @ValidateNested()
  @Type(() => CreateProfileDto)
  profile: CreateProfileDto;
}
