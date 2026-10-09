import { IsBoolean, IsOptional, IsString, IsUrl, MinLength, ValidateIf } from "class-validator";

import { IsUtcDateTime } from "../../shared/decorators/is-utc-date-time.decorator.js";
import { MaxCodePoints } from "../../shared/decorators/max-code-points.decorator.js";
import { NoNulCharacter } from "../../shared/decorators/no-nul-character.decorator.js";

export class CreateProfileDto {
  // @MaxCodePoints and @NoNulCharacter keep the value to what the column can
  // hold. See their files in src/shared/decorators.
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxCodePoints(100)
  @NoNulCharacter()
  firstName?: string;

  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxCodePoints(100)
  @NoNulCharacter()
  lastName?: string;

  @IsString()
  @IsOptional()
  @NoNulCharacter()
  bio?: string;

  // Same rule as an abiding's imageUrl. @NoNulCharacter stays: @IsUrl lets a
  // NUL through.
  @IsUrl()
  @IsOptional()
  @NoNulCharacter()
  profileImageUrl?: string;

  // Not @IsOptional(): that also skips null, and this column is NOT NULL, so
  // { "isDude": null } reached Postgres and came back as a 500. This skips a
  // missing field only. Every other field here maps to a nullable column and
  // keeps @IsOptional(), so a client can send null to clear it.
  @IsBoolean()
  @ValidateIf((_, value) => value !== undefined)
  isDude?: boolean;

  // Optional ordination date: an instant in UTC, such as
  // "2026-10-06T12:00:00Z". A date with no time is not accepted. gmt checks
  // that the instant is real; see is-utc-date-time.decorator.ts.
  @IsUtcDateTime()
  @IsOptional()
  ordainedDate?: string;
}
