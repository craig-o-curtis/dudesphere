import { IsOptional, Max, Min } from "class-validator";

import { IntFromDigits } from "../../decorators/int-from-digits.decorator.js";

export const DEFAULT_LIMIT = 10;
// Caps how much of a table or collection one request can read.
export const MAX_LIMIT = 100;
export const DEFAULT_PAGE = 1;
// Far past any real list, and far below where an OFFSET stops fitting.
export const MAX_PAGE = 1_000_000;

/**
 * The `?limit=&page=` query on every list route.
 *
 * A route with filters of its own joins this class to its own DTO with
 * IntersectionType, as GetAbidingsDto does. It must not redeclare `limit` or
 * `page`: a redeclared field loses its default and its decorators.
 */
export class PaginationQueryDto {
  // Query params arrive as strings. The @IntFromDigits here converts the
  // string to a number before it is validated.
  @IsOptional()
  @IntFromDigits(DEFAULT_LIMIT)
  @Min(1)
  @Max(MAX_LIMIT)
  limit: number = DEFAULT_LIMIT;

  // @Min(1) because the service computes skip as (page - 1) * limit. Page 0
  // sent OFFSET -10 to Postgres, which rejects it as a 500.
  @IsOptional()
  @IntFromDigits(DEFAULT_PAGE)
  @Min(1)
  // The other end of the same bug. A page of 1e20 passes @IsInt, and its
  // OFFSET overflows Postgres's bigint, which is also a 500.
  @Max(MAX_PAGE)
  page: number = DEFAULT_PAGE;
}
