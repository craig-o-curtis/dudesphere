import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { CreateProfileDto } from "./create-profile-dto.js";

describe("CreateProfileDto", () => {
  /** The fields that fail for exactly this body. */
  async function invalidFieldsOf(body: object) {
    return (await validate(plainToInstance(CreateProfileDto, body))).map((error) => error.property);
  }

  /** The fields that fail when the body also carries a valid display name. */
  function invalidFields(body: object) {
    return invalidFieldsOf({ displayName: "The Dude", ...body });
  }

  it("accepts a display name alone: the rest of a profile starts with defaults", async () => {
    expect(await invalidFieldsOf({ displayName: "The Dude" })).toEqual([]);
  });

  it("rejects null for isDude, which its column cannot hold", async () => {
    expect(await invalidFields({ isDude: null })).toEqual(["isDude"]);
  });

  it("accepts null for a nullable field", async () => {
    expect(await invalidFields({ bio: null })).toEqual([]);
  });

  // The one name other members see. It is unique, so two names that look the
  // same have to be the same string. See src/shared/utils/display-name.ts.
  describe("displayName", () => {
    function cleaned(displayName: string) {
      return plainToInstance(CreateProfileDto, { displayName }).displayName;
    }

    it.each([
      ["no display name", {}],
      ["null", { displayName: null }],
      ["a number", { displayName: 42 }],
      ["an empty string", { displayName: "" }],
      ["only spaces", { displayName: "    " }],
      ["one character", { displayName: "D" }],
    ])("rejects %s", async (_what, body) => {
      expect(await invalidFieldsOf(body)).toEqual(["displayName"]);
    });

    it("accepts 2 characters and 50, and rejects 51", async () => {
      expect(await invalidFieldsOf({ displayName: "Da" })).toEqual([]);
      expect(await invalidFieldsOf({ displayName: "a".repeat(50) })).toEqual([]);
      expect(await invalidFieldsOf({ displayName: "a".repeat(51) })).toEqual(["displayName"]);
    });

    it.each([
      ["spaces at the ends", "  The Dude ", "The Dude"],
      ["a run of spaces", "The    Dude", "The Dude"],
      ["a tab and a line break", "The\t\nDude", "The Dude"],
      ["a non-breaking space", "The Dude", "The Dude"],
      ["full-width letters", "Ｔｈｅ Dude", "The Dude"],
    ])("cleans %s before it is checked or stored", (_what, typed, stored) => {
      expect(cleaned(typed)).toBe(stored);
    });

    // The length is judged after cleaning, so padding cannot push a name over.
    it("counts the cleaned value, not the typed one", async () => {
      const padded = `   ${"a".repeat(50)}   `;

      expect(await invalidFieldsOf({ displayName: padded })).toEqual([]);
    });

    it("keeps the casing as typed", () => {
      expect(cleaned("tHe DuDe")).toBe("tHe DuDe");
    });

    it.each([
      ["an accent", "El Duderinó"],
      ["another alphabet", "Дюд"],
      ["an emoji", "The Dude \u{1F3B3}"],
      // A heart drawn as an emoji is the heart plus a variation selector.
      ["an emoji that needs a variation selector", "The Dude ❤️"],
      ["an apostrophe and a full stop", "Jackie Treehorn's Jr."],
    ])("accepts %s", async (_what, displayName) => {
      expect(await invalidFieldsOf({ displayName })).toEqual([]);
    });

    // Each of these looks exactly like "The Dude" on screen. If one were
    // accepted, it would count as a different name and get past the unique
    // rule.
    it.each([
      ["a zero-width space", "The​Dude"],
      ["a zero-width joiner", "The Du‍de"],
      ["a soft hyphen", "The Du­de"],
      ["a right-to-left override", "‮The Dude"],
      ["a word joiner", "The Dude⁠"],
      ["a combining grapheme joiner", "The Du͏de"],
      ["a Hangul filler, which is drawn as a blank", "The Dudeㅤx"],
      ["an empty braille cell, which is drawn as a blank", "The Dude⠀x"],
      ["a private-use character", "The Dude"],
      ["a control character", "The Du\u0007de"],
      ["a NUL character", "The Du\u0000de"],
    ])("rejects %s", async (_what, displayName) => {
      expect(await invalidFieldsOf({ displayName })).toEqual(["displayName"]);
    });

    // The price of refusing joiners: an emoji that is several emoji joined by
    // a zero-width joiner is refused too.
    it("rejects an emoji built by joining others, such as a family", async () => {
      const family = "\u{1F468}‍\u{1F469}‍\u{1F467}";

      expect(await invalidFieldsOf({ displayName: `The Dudes ${family}` })).toEqual([
        "displayName",
      ]);
    });
  });

  describe("ordainedDate", () => {
    it("accepts an instant in UTC", async () => {
      expect(await invalidFields({ ordainedDate: "2026-10-06T12:00:00.000Z" })).toEqual([]);
    });

    // Each of these used to pass. The week date then failed in Postgres as a
    // 500, and the others were stored as a different day from the one sent.
    it.each(["2026-W12", "2026-02-30", "2026", "2026-10-06"])("rejects %s", async (value) => {
      expect(await invalidFields({ ordainedDate: value })).toEqual(["ordainedDate"]);
    });
  });

  describe("profileImageUrl", () => {
    it("accepts a url", async () => {
      expect(await invalidFields({ profileImageUrl: "https://example.com/avatar.jpg" })).toEqual(
        [],
      );
    });

    it("rejects text that is not a url", async () => {
      expect(await invalidFields({ profileImageUrl: "my avatar" })).toEqual(["profileImageUrl"]);
    });

    // @IsUrl alone lets this through, which is why @NoNulCharacter stays.
    it("rejects a url with a NUL character in it", async () => {
      expect(await invalidFields({ profileImageUrl: "https://example.com/a\u0000b.jpg" })).toEqual([
        "profileImageUrl",
      ]);
    });
  });

  it.each(["displayName", "bio", "profileImageUrl"])(
    "rejects a NUL character in %s",
    async (field) => {
      expect(await invalidFields({ [field]: "ab\u0000cd" })).toEqual([field]);
    },
  );
});
