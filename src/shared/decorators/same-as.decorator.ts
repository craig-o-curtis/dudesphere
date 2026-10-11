import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from "class-validator";

/**
 * Rejects a value that differs from another field of the same object.
 *
 * For a field typed twice so a slip is caught, such as `confirmPassword`:
 * `@SameAs("password")`. class-validator has no built-in rule that compares
 * two fields.
 *
 * The comparison is ===, so the two must match exactly, case and spaces
 * included.
 */
export function SameAs(property: string, options?: ValidationOptions): PropertyDecorator {
  return function (target: object, propertyName: string | symbol): void {
    registerDecorator({
      name: "sameAs",
      target: target.constructor,
      propertyName: String(propertyName),
      constraints: [property],
      options,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          return value === (args.object as Record<string, unknown>)[property];
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must match ${property}`;
        },
      },
    });
  };
}
