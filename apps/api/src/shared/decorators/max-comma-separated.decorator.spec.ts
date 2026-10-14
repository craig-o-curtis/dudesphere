import { plainToInstance } from "class-transformer";
import { IsOptional, IsString, validateSync } from "class-validator";

import { MaxCommaSeparated } from "./max-comma-separated.decorator.js";

class Filter {
  @IsOptional()
  @IsString()
  @MaxCommaSeparated(3)
  tags?: string;
}

function errorsFor(tags: unknown) {
  return validateSync(plainToInstance(Filter, { tags }));
}

describe("MaxCommaSeparated", () => {
  it.each(["a", "a,b", "a,b,c"])("accepts %j, which is within the limit", (tags) => {
    expect(errorsFor(tags)).toHaveLength(0);
  });

  it("rejects one value over the limit, and says how many are allowed", () => {
    const errors = errorsFor("a,b,c,d");

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual({
      maxCommaSeparated: "tags must hold at most 3 comma-separated values",
    });
  });

  // Empty parts are not values. The handler drops them, so they must not use
  // up the limit either.
  it("does not count empty parts", () => {
    expect(errorsFor("a,,b, ,c,")).toHaveLength(0);
  });

  it("accepts a string of only commas", () => {
    expect(errorsFor(",,,,,,")).toHaveLength(0);
  });

  // Left to @IsString, so the caller gets one error for the real problem.
  it("leaves a value that is not a string to @IsString", () => {
    const errors = errorsFor(["a", "b", "c", "d"]);

    expect(errors).toHaveLength(1);
    expect(Object.keys(errors[0].constraints ?? {})).toEqual(["isString"]);
  });

  it("accepts a missing value on an optional field", () => {
    expect(validateSync(plainToInstance(Filter, {}))).toHaveLength(0);
  });
});
