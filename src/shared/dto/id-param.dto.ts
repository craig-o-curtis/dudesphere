import { Max, Min } from "class-validator";

import { IntFromDigits } from "../decorators/int-from-digits.decorator.js";

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
 * Validated by the global ValidationPipe rather than a pipe of our own.
 * @IntFromDigits converts the string and accepts plain digits only. Without
 * that rule "0x10" would reach row 16 and "+5" row 5, so one row would answer
 * to several URLs.
 *
 * Mongo-backed routes do not use this. An abiding's id is an ObjectId, so it
 * goes through ParseObjectIdPipe, and a hashtag is keyed by its slug.
 */
export class IdParamDto {
  @IntFromDigits()
  @Min(1)
  @Max(PG_INT_MAX)
  id: number;
}
