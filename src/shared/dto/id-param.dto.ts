import { Transform } from "class-transformer";
import { IsInt, Max, Min } from "class-validator";

/** The largest value a Postgres `integer` column can hold. */
export const PG_INT_MAX = 2_147_483_647;

/**
 * A Postgres primary key taken from the URL, for every route whose `:id` is a
 * `user` or `profile` row.
 *
 * Replaces ParseIntPipe, which has no upper bound: its check is the regex
 * `/^-?\d+$/`, so a 20-digit id passed, parseInt returned 1e20, and Postgres
 * rejected the value with numeric_value_out_of_range. QueryFailedFilter only
 * converts unique violations, so the caller got a 500 for what was plainly a
 * bad request.
 *
 * Validated by the global ValidationPipe rather than a pipe of our own. The
 * @Transform is what coerces the string, because that pipe runs with
 * transform: true but not enableImplicitConversion.
 *
 * It is digits-only on purpose. A plain @Type(() => Number) would also accept
 * "0x10" as 16, "1e5" as 100000 and "+5" as 5, so one row would answer to
 * several URLs. Anything that is not digits becomes NaN here and @IsInt turns
 * it into a 400.
 *
 * Mongo-backed routes do not use this. An abiding's id is an ObjectId, so it
 * goes through ParseObjectIdPipe, and a hashtag is keyed by its slug.
 */
export class IdParamDto {
  @Transform(({ value }) => (/^\d+$/.test(String(value)) ? Number(value) : Number.NaN))
  @IsInt()
  @Min(1)
  @Max(PG_INT_MAX)
  id: number;
}
