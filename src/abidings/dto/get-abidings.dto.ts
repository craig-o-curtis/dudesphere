import { IntersectionType } from "@nestjs/mapped-types";
import { IsOptional, IsString, Min } from "class-validator";

import { IntFromDigits } from "../../shared/decorators/int-from-digits.decorator.js";
import { MaxCommaSeparated } from "../../shared/decorators/max-comma-separated.decorator.js";
import { PaginationQueryDto } from "../../shared/dto/pagination-query.dto.js";
import { MAX_TAGS } from "../../shared/utils/hashtag.js";

// The filters that belong to GET /abidings alone. Not exported: the route
// takes GetAbidingsDto below, which adds limit and page.
class GetAbidingsBaseDto {
  // A number, not a string. ValidationPipe runs with transform: true but not
  // enableImplicitConversion, so @IntFromDigits is what converts the query
  // string. Without it an unparseable userId became NaN in the controller,
  // fell through a truthiness check, and the filter was silently dropped —
  // so a typo returned every abiding instead of an error.
  @IsOptional()
  @IntFromDigits()
  @Min(1)
  userId?: number;

  // One tag, or several comma-separated ("dude,sunday") matched with OR —
  // an abiding needs only one of them. Each is accepted with or without a
  // leading # and normalized by the service before it reaches Mongo. See
  // src/shared/utils/hashtag.ts.
  //
  // At most MAX_TAGS of them. With no limit, a few hundred characters of
  // query string on this public route were enough to make Mongo sort every
  // matching abiding in memory: it merges sorted index runs for up to 200
  // tags and gives up past that. No abiding carries more than MAX_TAGS, so
  // nobody needs to ask for more.
  @IsOptional()
  @IsString()
  @MaxCommaSeparated(MAX_TAGS)
  hashtag?: string;
}

// limit and page come from PaginationQueryDto, with their defaults and their
// rules. They are not redeclared here: a redeclared field would lose both.
export class GetAbidingsDto extends IntersectionType(GetAbidingsBaseDto, PaginationQueryDto) {}
