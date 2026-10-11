import { cleanDisplayName, DISPLAY_NAME_CHARACTERS } from "./display-name.js";

// The DTO-level cases, with the validators around them, are in
// src/profiles/dto/create-profile-dto.spec.ts. These are the two exports on
// their own.
describe("cleanDisplayName", () => {
  it("trims, and makes each run of whitespace one space", () => {
    expect(cleanDisplayName("  The \t\n  Dude  ")).toBe("The Dude");
  });

  it("puts the string in Unicode form NFKC", () => {
    // "e" plus a combining acute accent becomes the single letter.
    expect(cleanDisplayName("Duderinó")).toBe("Duderinó");
    // A full-width letter becomes the plain one.
    expect(cleanDisplayName("Ｄude")).toBe("Dude");
  });

  it("leaves the casing alone", () => {
    expect(cleanDisplayName("tHe DuDe")).toBe("tHe DuDe");
  });

  // So the validators still see the bad value and refuse it. A transform that
  // threw on null would turn a 400 into a 500.
  it.each([null, undefined, 42, true, { displayName: "x" }])(
    "returns %j as it is, because it is not a string",
    (value) => {
      expect(cleanDisplayName(value)).toBe(value);
    },
  );
});

describe("DISPLAY_NAME_CHARACTERS", () => {
  it.each(["The Dude", "El Duderinó", "The Dude \u{1F3B3}", "❤️"])("matches %j", (value) => {
    expect(DISPLAY_NAME_CHARACTERS.test(value)).toBe(true);
  });

  it.each([
    ["a zero-width space", "​"],
    ["a zero-width joiner", "‍"],
    ["a byte order mark", "﻿"],
    ["a line break", "\n"],
    ["a NUL", "\u0000"],
    ["a private-use character", ""],
    ["an unpaired surrogate", "\uD83C"],
    ["a combining grapheme joiner", "͏"],
    ["a Hangul filler", "ㅤ"],
    ["an empty braille cell", "⠀"],
  ])("does not match a string holding %s", (_what, character) => {
    expect(DISPLAY_NAME_CHARACTERS.test(`The${character}Dude`)).toBe(false);
  });

  // The regular expression has no "g" flag, so test() keeps no position
  // between calls and the same value always gives the same answer.
  it("gives the same answer when asked twice", () => {
    expect(DISPLAY_NAME_CHARACTERS.test("The Dude")).toBe(true);
    expect(DISPLAY_NAME_CHARACTERS.test("The Dude")).toBe(true);
  });
});
