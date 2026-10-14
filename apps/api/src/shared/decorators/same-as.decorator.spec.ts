import { IsOptional, validateSync } from "class-validator";

import { SameAs } from "./same-as.decorator.js";

class Form {
  password: unknown;

  @SameAs("password")
  confirmPassword: unknown;
}

class FormWithMessage {
  password: unknown;

  @IsOptional()
  @SameAs("password", { message: "The two passwords differ" })
  confirmPassword: unknown;
}

function errorsFor(values: Partial<Form>) {
  return validateSync(Object.assign(new Form(), values));
}

describe("@SameAs", () => {
  it("accepts a value equal to the other field", () => {
    expect(errorsFor({ password: "secret1", confirmPassword: "secret1" })).toEqual([]);
  });

  it.each([
    ["a different value", "secret2"],
    ["a different case", "Secret1"],
    ["a space on the end", "secret1 "],
    ["nothing", undefined],
  ])("rejects %s", (_what, confirmPassword) => {
    const errors = errorsFor({ password: "secret1", confirmPassword });

    expect(errors.map((error) => error.property)).toEqual(["confirmPassword"]);
    expect(errors[0].constraints).toEqual({ sameAs: "confirmPassword must match password" });
  });

  // === and not ==, so a number never passes as its own digits.
  it("does not treat 123 and '123' as the same", () => {
    expect(errorsFor({ password: "123", confirmPassword: 123 })).toHaveLength(1);
  });

  it("uses a message of the caller's own when given one", () => {
    const errors = validateSync(
      Object.assign(new FormWithMessage(), { password: "a", confirmPassword: "b" }),
    );

    expect(errors[0].constraints).toEqual({ sameAs: "The two passwords differ" });
  });
});
