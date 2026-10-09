import {
  IsBoolean,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
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

  // Not @IsOptional(): that also skips null, and this column is NOT NULL, so
  // { "isDude": null } reached Postgres and came back as a 500. This skips a
  // missing field only. Every other field here maps to a nullable column and
  // keeps @IsOptional(), so a client can send null to clear it.
  @IsBoolean()
  @ValidateIf((_, value) => value !== undefined)
  isDude?: boolean;

  // Optional ordination date as ISO 8601 UTC string (e.g., "2026-10-06T12:00:00.000Z")
  @IsISO8601({ strict: false })
  @IsOptional()
  ordainedDate?: string;
}
