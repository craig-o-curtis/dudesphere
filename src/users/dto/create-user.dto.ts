import {
  IsBoolean,
  IsEmail,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(100)
  name: string;

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

  @IsBoolean()
  @IsOptional()
  isDude?: boolean;

  // Optional ordination date as ISO 8601 UTC string (e.g., "2026-09-28T12:00:00.000Z")
  @IsISO8601({ strict: false })
  @IsOptional()
  ordainedDate?: string;
}
