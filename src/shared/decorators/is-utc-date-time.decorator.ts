import { isValidUtc, rfc3339DateTime } from "@northguild/gmt";
import { registerDecorator, type ValidationOptions } from "class-validator";

/**
 * Accepts one shape only: a real instant in UTC, written `<date>T<time>Z`,
 * such as "2026-10-06T12:00:00Z" or "2026-10-06T12:00:00.000Z".
 *
 * Both checks come from gmt. A value must pass both, and neither is enough
 * alone:
 *
 * - `isValidUtc` does the real work. It proves the instant exists, so
 *   30 February fails, and it insists on `T` and `Z`, so a date with no time,
 *   a week date and any other offset fail too. But it follows Temporal, so it
 *   also accepts three forms this app cannot store: an annotation such as
 *   `Z[Europe/Paris]`, a comma before the fraction, and a six-digit year such
 *   as -005000. TypeORM turns the first two into an Invalid Date.
 * - `rfc3339DateTime` is here only to refuse those three forms. It is a
 *   pattern, and looser than `isValidUtc` everywhere else: on its own it
 *   would accept 30 February, a `+03:00` offset and a lower-case `z`. That
 *   does not matter, because `isValidUtc` has already refused them.
 *
 * Before this, the field used @IsISO8601({ strict: false }). "2026-W12"
 * passed it and failed in Postgres as a 500, and "2026-02-30" passed it and
 * was stored as 2 March.
 *
 * Digits past milliseconds are accepted and then dropped when the value is
 * stored.
 */
export function IsUtcDateTime(options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: "isUtcDateTime",
      target: target.constructor,
      propertyName: String(propertyName),
      options,
      validator: {
        validate: (value: unknown) =>
          typeof value === "string" && isValidUtc(value) && rfc3339DateTime.test(value),
        defaultMessage: (args) =>
          `${args?.property ?? "value"} must be a UTC date-time such as 2026-10-06T12:00:00Z`,
      },
    });
  };
}
