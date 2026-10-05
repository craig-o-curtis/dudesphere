import { Type } from "class-transformer";
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";

import { CreateProfileDto } from "../../profiles/dto/create-profile-dto.js";

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  // 24 to match varchar(24) on the column. A longer value used to pass
  // validation and then fail in Postgres as a 500.
  @MaxLength(24)
  username: string;

  @IsString()
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(100)
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(20)
  password: string;

  // Optional. A profile is always created; these are its starting values.
  // @ValidateNested + @Type are BOTH needed for the nested fields to be validated.
  // NOTE - the confusing here is that on teh actual User table, the profile is a relation, not a column.
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateProfileDto)
  profile?: CreateProfileDto;
}
