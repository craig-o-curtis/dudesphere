import { NotContains, type ValidationOptions } from "class-validator";

/**
 * Rejects a string that contains the NUL character (U+0000).
 *
 * Postgres cannot store NUL in a text or varchar column. A value that held
 * one passed validation and failed on insert as a 500. Use this on every
 * string field stored in Postgres.
 *
 * It wraps the built-in @NotContains with a message of its own. The built-in
 * message quotes the forbidden text, which here would put a raw NUL in the
 * response body.
 */
export function NoNulCharacter(options?: ValidationOptions): PropertyDecorator {
  return NotContains("\u0000", {
    message: "$property must not contain the NUL character",
    ...options,
  });
}
