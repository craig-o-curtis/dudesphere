import {
  DISPLAY_NAME_PATTERN,
  EMAIL_PATTERN,
  EMAIL_TITLE,
  IDENTIFIER_MAX_LENGTH,
  PASSWORD_PATTERN,
  USERNAME_PATTERN,
} from "./auth-rules";

// The browser compiles a `pattern` attribute like this.
function compile(pattern: string): RegExp {
  return new RegExp(`^(?:${pattern})$`, "v");
}

describe("auth rules", () => {
  it("exports the email hint and the sign-in identifier limit", () => {
    expect(EMAIL_TITLE).toBe("Enter an email like name@example.com.");
    expect(IDENTIFIER_MAX_LENGTH).toBe(100);
  });

  describe("EMAIL_PATTERN", () => {
    it.each(["name@example.com", "a@b.co"])("accepts %j", (value) => {
      expect(compile(EMAIL_PATTERN).test(value)).toBe(true);
    });

    it.each(["a@b", "a@b.c", "a b@example.com", "a@@example.com", "plain"])(
      "refuses %j",
      (value) => {
        expect(compile(EMAIL_PATTERN).test(value)).toBe(false);
      },
    );
  });

  describe("DISPLAY_NAME_PATTERN", () => {
    it.each(["ab", "a b", "The Dude"])("accepts %j", (value) => {
      expect(compile(DISPLAY_NAME_PATTERN).test(value)).toBe(true);
    });

    it.each(["   ", " a ", "a"])("refuses %j", (value) => {
      expect(compile(DISPLAY_NAME_PATTERN).test(value)).toBe(false);
    });
  });

  describe("USERNAME_PATTERN", () => {
    it("accepts a name without @ or spaces", () => {
      expect(compile(USERNAME_PATTERN).test("the_dude")).toBe(true);
    });

    it.each(["the dude", "the@dude"])("refuses %j", (value) => {
      expect(compile(USERNAME_PATTERN).test(value)).toBe(false);
    });
  });

  describe("PASSWORD_PATTERN", () => {
    it("accepts 12 to 128 code points", () => {
      expect(compile(PASSWORD_PATTERN).test("a".repeat(12))).toBe(true);
      expect(compile(PASSWORD_PATTERN).test("a".repeat(128))).toBe(true);
    });

    it("refuses 11 and 129", () => {
      expect(compile(PASSWORD_PATTERN).test("a".repeat(11))).toBe(false);
      expect(compile(PASSWORD_PATTERN).test("a".repeat(129))).toBe(false);
    });

    it("counts an emoji as one code point", () => {
      expect(compile(PASSWORD_PATTERN).test("😀".repeat(12))).toBe(true);
    });
  });
});
