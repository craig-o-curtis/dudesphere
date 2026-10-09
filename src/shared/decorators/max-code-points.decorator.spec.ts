import { maxLength, validateSync } from "class-validator";

import { MaxCodePoints } from "./max-code-points.decorator.js";

class Sample {
  @MaxCodePoints(4)
  value: unknown;
}

function messagesFor(value: unknown): string[] {
  const sample = Object.assign(new Sample(), { value });
  return validateSync(sample).flatMap((error) => Object.values(error.constraints ?? {}));
}

describe("MaxCodePoints", () => {
  it.each([
    ["an empty string", ""],
    ["plain letters at the limit", "abcd"],
    // One code point each, though each is two UTF-16 units.
    ["emoji at the limit", "😀😀😀😀"],
    ["a line break, which counts as one", "ab\nc"],
  ])("accepts %s", (_what, value) => {
    expect(messagesFor(value)).toEqual([]);
  });

  it.each([
    ["plain letters one past the limit", "abcde"],
    ["emoji one past the limit", "😀😀😀😀😀"],
  ])("rejects %s", (_what, value) => {
    expect(messagesFor(value)).toEqual(["value must be at most 4 characters"]);
  });

  // The case @MaxLength gets wrong. A red heart is U+2764 followed by the
  // variation selector U+FE0F. @MaxLength leaves the selector out of its
  // count; a Postgres varchar counts it.
  it("counts a variation selector, which @MaxLength does not", () => {
    const threeRedHearts = "❤️".repeat(3);

    expect(maxLength(threeRedHearts, 4)).toBe(true);
    expect(messagesFor(threeRedHearts)).toEqual(["value must be at most 4 characters"]);
  });

  it("rejects a value that is not a string", () => {
    expect(messagesFor(12345)).not.toEqual([]);
  });
});
