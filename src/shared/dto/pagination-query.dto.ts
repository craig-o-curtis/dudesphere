import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

// Far past any real list, and far below where an OFFSET stops fitting.
export const MAX_PAGE = 1_000_000;

export class PaginationQueryDto {
  // Query params arrive as strings. @Type converts before @IsInt runs — the
  // global ValidationPipe in src/app-setup.ts does not enable implicit conversion.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  // Caps how much of the table one request can read.
  @Max(100)
  limit: number = 10;

  // @Min(1) because the service computes skip as (page - 1) * limit. Page 0
  // sent OFFSET -10 to Postgres, which rejects it as a 500.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  // The other end of the same bug. A page of 1e20 passes @IsInt, and its
  // OFFSET overflows Postgres's bigint, which is also a 500.
  @Max(MAX_PAGE)
  page: number = 1;
}
