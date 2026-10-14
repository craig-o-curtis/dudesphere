import { applyDecorators } from "@nestjs/common";
import { Transform, type TransformFnParams } from "class-transformer";
import { IsInt } from "class-validator";

// undefined returns the fallback. No request arrives that way: a missing
// param never reaches a @Transform, and an empty one (?limit=) arrives as ""
// and is an error. The branch is for code that builds the DTO itself and
// passes a key set to undefined, which would otherwise wipe the field's
// default.
//
// A value that is already a number is passed on for the same reason. Only
// code can send one, never a URL, and @IsInt still accepts or refuses it.
function digitsOr(fallback?: number) {
  return ({ value }: TransformFnParams): number | undefined => {
    if (value === undefined) return fallback;
    if (typeof value === "number") return value;
    return typeof value === "string" && /^\d+$/.test(value) ? Number(value) : Number.NaN;
  };
}

/**
 * Converts a string to a whole number, and accepts plain digits only. Use it
 * on any number that arrives as a string: a route param, a query param or an
 * environment variable.
 *
 * Those values need converting before they are validated. The global
 * ValidationPipe in src/app-setup.ts does not enable implicit conversion, and
 * validateEnv in src/config/env.validate.ts does not either.
 *
 * It is digits-only on purpose. A plain @Type(() => Number) also accepted
 * "0x10" as 16, "1e1" as 10 and "+5" as 5. Anything that is not digits becomes
 * NaN here, and the @IsInt this applies turns NaN into an error. That covers
 * an empty value (?limit=) and a repeated one (?page=1&page=2), which arrives
 * as an array.
 *
 * Pass `fallback` for a query param that has a default. Put @IsOptional, @Min
 * and @Max on the field as usual.
 */
export function IntFromDigits(fallback?: number): PropertyDecorator {
  return applyDecorators(Transform(digitsOr(fallback)), IsInt());
}
