import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MinLength,
  ValidateIf,
} from "class-validator";

import { IsUtcDateTime } from "../../shared/decorators/is-utc-date-time.decorator.js";
import { MaxCodePoints } from "../../shared/decorators/max-code-points.decorator.js";
import { NoNulCharacter } from "../../shared/decorators/no-nul-character.decorator.js";
import { cleanDisplayName, DISPLAY_NAME_CHARACTERS } from "../../shared/utils/display-name.js";

export class CreateProfileDto {
  // The one name other members see. It is unique, ignoring letter case.
  //
  // Required, so sign up has to carry one. UpdateProfileDto makes every field
  // optional, but there is no @IsOptional() here, so a null is still refused
  // there, which the NOT NULL column needs.
  //
  // cleanDisplayName runs first, so the rules below judge the value that is
  // stored. @MaxCodePoints and @NoNulCharacter keep it to what the column can
  // hold. See src/shared/utils/display-name.ts for the rest.
  @Transform(({ value }: { value: unknown }) => cleanDisplayName(value))
  @IsString()
  @MinLength(2)
  @MaxCodePoints(50)
  @NoNulCharacter()
  @Matches(DISPLAY_NAME_CHARACTERS, {
    message: "displayName must not contain invisible or control characters",
  })
  displayName: string;

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
