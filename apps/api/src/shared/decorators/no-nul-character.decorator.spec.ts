import { validateSync } from "class-validator";

import { NoNulCharacter } from "./no-nul-character.decorator.js";

class Sample {
  @NoNulCharacter()
  value: unknown;
}

function messagesFor(value: unknown): string[] {
  const sample = Object.assign(new Sample(), { value });
  return validateSync(sample).flatMap((error) => Object.values(error.constraints ?? {}));
}

describe("NoNulCharacter", () => {
  it.each(["", "The Dude abides", "line one\nline two", "😀"])("accepts %j", (value) => {
    expect(messagesFor(value)).toEqual([]);
  });

  it.each(["\u0000", "ab\u0000", "\u0000ab", "a\u0000b"])("rejects %j", (value) => {
    expect(messagesFor(value)).toEqual(["value must not contain the NUL character"]);
  });

  // The built-in message quotes the forbidden text, so it would carry a raw
  // NUL into the response body.
  it("keeps the NUL character out of its own message", () => {
    expect(messagesFor("a\u0000b").join("")).not.toContain("\u0000");
  });
});
