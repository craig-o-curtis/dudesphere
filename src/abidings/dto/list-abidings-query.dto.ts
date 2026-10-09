import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Min } from "class-validator";

import { PaginationQueryDto } from "../../shared/dto/pagination-query.dto.js";

// limit and page come from PaginationQueryDto. They are not redeclared here:
// a redeclared field would lose its default and its decorators.
export class ListAbidingsQueryDto extends PaginationQueryDto {
  // A number, not a string. ValidationPipe runs with transform: true but not
  // enableImplicitConversion, so @Type is what actually coerces the query
  // string. Without it an unparseable userId became NaN in the controller,
  // fell through a truthiness check, and the filter was silently dropped —
  // so a typo returned every abiding instead of an error.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  userId?: number;

  // One tag, or several comma-separated ("dude,sunday") matched with OR —
  // an abiding needs only one of them. Each is accepted with or without a
  // leading # and normalized by the service before it reaches Mongo. See
  // src/shared/utils/hashtag.ts.
  @IsOptional()
  @IsString()
  hashtag?: string;
}
