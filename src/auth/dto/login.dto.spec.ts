import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";

import { LoginDto } from "./login.dto.js";

// plainToInstance, as ValidationPipe does with transform: true, so the
// @Transform on identifier runs before the rules do.
function buildDto(body: Record<string, unknown>): LoginDto {
  return plainToInstance(LoginDto, { identifier: "dude", password: "secret1", ...body });
}

function invalidFields(body: Record<string, unknown>): string[] {
  return validateSync(buildDto(body)).map((error) => error.property);
}

describe("LoginDto", () => {
  describe("identifier", () => {
    it.each(["dude", "dude@example.com", "The_Dude"])("accepts %s", (identifier) => {
      expect(invalidFields({ identifier })).toEqual([]);
    });

    // Autofill and a phone keyboard both add a space after a word.
    it("trims the spaces around it", () => {
      expect(buildDto({ identifier: "  dude@example.com \n" }).identifier).toBe("dude@example.com");
    });

    it.each([
      ["an empty string", ""],
      ["only spaces", "   "],
      ["a number", 42],
      ["null", null],
      ["nothing", undefined],
    ])("rejects %s", (_what, identifier) => {
      expect(invalidFields({ identifier })).toEqual(["identifier"]);
    });

    // 100 is the email column's limit, the longer of the two.
    it("accepts 100 characters and rejects 101", () => {
      expect(invalidFields({ identifier: "a".repeat(100) })).toEqual([]);
      expect(invalidFields({ identifier: "a".repeat(101) })).toEqual(["identifier"]);
    });

    it("rejects a NUL character, which Postgres cannot store or search for", () => {
      expect(invalidFields({ identifier: "du\u0000de" })).toEqual(["identifier"]);
    });

    // No username rule and no email rule: a value that fits neither is not
    // found, and gets the same 401 as a wrong password.
    it.each(["a", "not an email@", "two words"])("leaves %s for the lookup to refuse", (value) => {
      expect(invalidFields({ identifier: value })).toEqual([]);
    });
  });

  describe("password", () => {
    // Sign-up asks for 6. Login must not, or an account whose password was
    // set another way, such as by the seed, could never log in.
    it("accepts a password shorter than sign-up allows", () => {
      expect(invalidFields({ password: "a" })).toEqual([]);
    });

    it("rejects an empty password", () => {
      expect(invalidFields({ password: "" })).toEqual(["password"]);
    });

    // bcrypt reads 72 bytes and ignores the rest.
    it("accepts 72 bytes and rejects 73", () => {
      expect(invalidFields({ password: "a".repeat(72) })).toEqual([]);
      expect(invalidFields({ password: "a".repeat(73) })).toEqual(["password"]);
    });

    it("counts bytes, not characters", () => {
      // 25 characters, 75 bytes.
      expect(invalidFields({ password: "\u20AC".repeat(25) })).toEqual(["password"]);
    });
  });
});
