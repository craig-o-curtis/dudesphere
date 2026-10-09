import { Matches, type ValidationOptions } from "class-validator";

/**
 * Like @MaxLength, but counts the way a Postgres `varchar(n)` does: one for
 * every code point.
 *
 * @MaxLength does not count that way. It leaves out variation selectors, the
 * invisible code points that follow some characters, such as U+FE0F after a
 * red heart. So a value could pass @MaxLength(24), hold 48 characters as
 * Postgres counts them, and fail on insert as a 500.
 *
 * Use this on any field stored in a sized Postgres column, with the column's
 * own length. It wraps the built-in @Matches: with the `u` flag `.` matches
 * one whole code point, and with `s` it matches line breaks too.
 */
export function MaxCodePoints(max: number, options?: ValidationOptions): PropertyDecorator {
  return Matches(new RegExp(`^.{0,${max}}$`, "su"), {
    message: `$property must be at most ${max} characters`,
    ...options,
  });
}
