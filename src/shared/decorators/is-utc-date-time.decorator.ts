import { isValidUtc, rfc3339DateTime } from "@northguild/gmt";
import { registerDecorator, type ValidationOptions } from "class-validator";

/**
 * Accepts one shape only: a real instant in UTC, written `<date>T<time>Z`,
 * such as "2026-10-06T12:00:00Z" or "2026-10-06T12:00:00.000Z".
 *
 * Both checks come from gmt, and each covers what the other lets through:
 *
 * - `isValidUtc` proves the instant exists, so 30 February fails. It also
 *   refuses a date with no time, a week date, and any offset but `Z`. It does
 *   accept a few forms this app cannot store: an annotation such as
 *   `Z[Europe/Paris]`, a comma before the fraction, and a year like -005000.
 * - `rfc3339DateTime` refuses those forms. It is only a pattern, so on its own
 *   it would accept 30 February.
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
