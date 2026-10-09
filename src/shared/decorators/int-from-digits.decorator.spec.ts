import { plainToInstance } from "class-transformer";
import { IsOptional, validateSync } from "class-validator";

import { IntFromDigits } from "./int-from-digits.decorator.js";

class Required {
  @IntFromDigits()
  value: number;
}

class WithDefault {
  @IsOptional()
  @IntFromDigits(10)
  value: number = 10;
}

function errorCount(dto: object): number {
  return validateSync(dto).length;
}

describe("IntFromDigits", () => {
  it.each([
    ["0", 0],
    ["7", 7],
    ["2147483647", 2_147_483_647],
  ])("converts %j to a number", (value, expected) => {
    const dto = plainToInstance(Required, { value });

    expect(errorCount(dto)).toBe(0);
    expect(dto.value).toBe(expected);
  });

  // Number() reads all but the last two of these as a number. Only plain
  // digits pass here.
  it.each(["0x10", "1e1", "+5", "-5", " 5", "5 ", "5.0", "", "abc"])(
    "rejects %j, which is not plain digits",
    (value) => {
      expect(errorCount(plainToInstance(Required, { value }))).toBe(1);
    },
  );

  // ?page=1&page=2 reaches the DTO as an array.
  it.each([[["1", "2"]], [["5"]]])("rejects the array %j", (value) => {
    expect(errorCount(plainToInstance(Required, { value }))).toBe(1);
  });

  it("keeps a value that is already a whole number", () => {
    const dto = plainToInstance(Required, { value: 7 });

    expect(errorCount(dto)).toBe(0);
    expect(dto.value).toBe(7);
  });

  it("rejects a number that is not whole", () => {
    expect(errorCount(plainToInstance(Required, { value: 1.5 }))).toBe(1);
  });

  it("rejects a missing value when the field has no fallback", () => {
    expect(errorCount(plainToInstance(Required, {}))).toBe(1);
  });

  it("keeps the default when the key is missing", () => {
    const dto = plainToInstance(WithDefault, {});

    expect(errorCount(dto)).toBe(0);
    expect(dto.value).toBe(10);
  });

  // A missing key never reaches the @Transform. A key set to undefined does,
  // and the transform has to hand the fallback back. Only code can do that:
  // a query string cannot, and its empty value (?limit=) is "" and an error.
  it("returns the fallback when the key is present but undefined", () => {
    const dto = plainToInstance(WithDefault, { value: undefined });

    expect(errorCount(dto)).toBe(0);
    expect(dto.value).toBe(10);
  });
});
