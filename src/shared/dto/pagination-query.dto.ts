import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

export class PaginationQueryDto {
  // Query params arrive as strings. @Type converts before @IsInt runs — the
  // global ValidationPipe in main.ts does not enable implicit conversion.
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
  page: number = 1;
}
