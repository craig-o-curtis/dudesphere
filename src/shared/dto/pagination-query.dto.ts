import { Transform, type TransformFnParams } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

export const DEFAULT_LIMIT = 10;
// Caps how much of a table or collection one request can read.
export const MAX_LIMIT = 100;
export const DEFAULT_PAGE = 1;
// Far past any real list, and far below where an OFFSET stops fitting.
export const MAX_PAGE = 1_000_000;

// Query params arrive as strings, and the global ValidationPipe in
// src/app-setup.ts does not enable implicit conversion. This converts the
// string to a number before it is validated.
//
// It is digits-only on purpose, the same rule IdParamDto follows. A plain
// @Type(() => Number) also accepted "0x10" as 16, "1e1" as 10 and "+5" as 5.
// Anything that is not digits becomes NaN here and @IsInt turns it into a 400.
// That covers an empty value (?limit=) and a repeated one (?page=1&page=2),
// which arrives as an array.
//
// undefined keeps the default. A missing param never reaches a @Transform,
// but a key that is present with no value does, and without this branch the
// default would be lost.
function digitsOr(fallback: number) {
  return ({ value }: TransformFnParams): number => {
    if (value === undefined) return fallback;
    if (typeof value === "number") return value;
    return typeof value === "string" && /^\d+$/.test(value) ? Number(value) : Number.NaN;
  };
}

/**
 * The `?limit=&page=` query on every list route.
 *
 * A route with filters of its own extends this class. It must not redeclare
 * `limit` or `page`: a redeclared field loses its default and its decorators.
 */
export class PaginationQueryDto {
  @IsOptional()
  @Transform(digitsOr(DEFAULT_LIMIT))
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit: number = DEFAULT_LIMIT;

  // @Min(1) because the service computes skip as (page - 1) * limit. Page 0
  // sent OFFSET -10 to Postgres, which rejects it as a 500.
  @IsOptional()
  @Transform(digitsOr(DEFAULT_PAGE))
  @IsInt()
  @Min(1)
  // The other end of the same bug. A page of 1e20 passes @IsInt, and its
  // OFFSET overflows Postgres's bigint, which is also a 500.
  @Max(MAX_PAGE)
  page: number = DEFAULT_PAGE;
}
