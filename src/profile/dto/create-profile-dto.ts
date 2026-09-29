import {
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateProfileDto {
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(100)
  firstName?: string;

  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(100)
  lastName?: string;

  @IsString()
  @IsOptional()
  bio?: string;

  @IsString()
  @IsOptional()
  profileImageUrl?: string;

  @IsBoolean()
  @IsOptional()
  isDude?: boolean;

  // Optional ordination date as ISO 8601 UTC string (e.g., "2026-09-28T12:00:00.000Z")
  @IsISO8601({ strict: false })
  @IsOptional()
  ordainedDate?: string;
}
