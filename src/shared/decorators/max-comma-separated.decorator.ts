import { registerDecorator, type ValidationOptions } from "class-validator";

import { splitCommaSeparated } from "../utils/comma-separated.js";

/**
 * Limits how many values a comma-separated string may hold, such as the
 * `?hashtag=dude,sunday` filter on GET /abidings.
 *
 * It counts with splitCommaSeparated, the function the handler reads the
 * value with, so empty parts do not count: `"a,,b,"` holds two.
 *
 * A value that is not a string passes. Pair it with @IsString, which is the
 * check that refuses those.
 */
export function MaxCommaSeparated(max: number, options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: "maxCommaSeparated",
      target: target.constructor,
      propertyName: String(propertyName),
      constraints: [max],
      options,
      validator: {
        validate: (value: unknown) =>
          typeof value !== "string" || splitCommaSeparated(value).length <= max,
        defaultMessage: (args) =>
          `${args?.property ?? "value"} must hold at most ${max} comma-separated values`,
      },
    });
  };
}
