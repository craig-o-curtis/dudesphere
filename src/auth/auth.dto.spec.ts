import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";

import { EmailDto, RefreshTokenDto, ResetPasswordDto, SignInDto } from "./auth.dto.js";

// plainToInstance, as ValidationPipe does with transform: true, so a
// @Transform runs before the rules do.
function invalidFields(dto: new () => object, body: Record<string, unknown>): string[] {
  return validateSync(plainToInstance(dto, body)).map((error) => error.property);
}

describe("SignInDto", () => {
  const valid = { identifier: "walter", password: "secret1" };

  describe("identifier", () => {
    it.each(["walter", "walter@example.com", "The_Dude"])("accepts %s", (identifier) => {
      expect(invalidFields(SignInDto, { ...valid, identifier })).toEqual([]);
    });

    // Autofill and a phone keyboard both add a space after a word.
    it("trims the spaces around it", () => {
      const dto = plainToInstance(SignInDto, { ...valid, identifier: "  walter@example.com \n" });

      expect(dto.identifier).toBe("walter@example.com");
      expect(validateSync(dto)).toEqual([]);
    });

    it.each([
      ["an empty string", ""],
      ["only spaces", "   "],
      ["a number", 42],
      ["null", null],
      ["nothing", undefined],
    ])("rejects %s", (_what, identifier) => {
      expect(invalidFields(SignInDto, { ...valid, identifier })).toEqual(["identifier"]);
    });

    // 100 is the email column's limit, the longer of the two.
    it("accepts 100 characters and rejects 101", () => {
      expect(invalidFields(SignInDto, { ...valid, identifier: "a".repeat(100) })).toEqual([]);
      expect(invalidFields(SignInDto, { ...valid, identifier: "a".repeat(101) })).toEqual([
        "identifier",
      ]);
    });

    // Counted the way Postgres counts: a variation selector is a character.
    it("counts every code point toward the 100", () => {
      expect(invalidFields(SignInDto, { ...valid, identifier: "❤️".repeat(50) })).toEqual([]);
      expect(invalidFields(SignInDto, { ...valid, identifier: `${"❤️".repeat(50)}a` })).toEqual([
        "identifier",
      ]);
    });

    it("rejects a NUL character, which Postgres cannot store or search for", () => {
      expect(invalidFields(SignInDto, { ...valid, identifier: "wal\u0000ter" })).toEqual([
        "identifier",
      ]);
    });

    // No username rule and no email rule: a value that fits neither is not
    // found, and gets the same 401 as a wrong password.
    it.each(["a", "not an email@", "two words"])("leaves %s for the lookup to refuse", (value) => {
      expect(invalidFields(SignInDto, { ...valid, identifier: value })).toEqual([]);
    });
  });

  describe("password", () => {
    // Sign-up asks for 6. Sign-in must not, or an account whose password was
    // set under an older rule, such as by the seed, could never sign in.
    it("accepts a password shorter than sign-up allows", () => {
      expect(invalidFields(SignInDto, { ...valid, password: "a" })).toEqual([]);
    });

    it("accepts a password longer than sign-up allows", () => {
      expect(invalidFields(SignInDto, { ...valid, password: "a".repeat(200) })).toEqual([]);
    });

    // Not trimmed: a space can be part of a password.
    it("keeps the spaces around it", () => {
      const dto = plainToInstance(SignInDto, { ...valid, password: " secret1 " });

      expect(dto.password).toBe(" secret1 ");
    });

    it.each([
      ["an empty string", ""],
      ["a number", 42],
      ["nothing", undefined],
    ])("rejects %s", (_what, password) => {
      expect(invalidFields(SignInDto, { ...valid, password })).toEqual(["password"]);
    });
  });
});

describe("RefreshTokenDto", () => {
  it("accepts a token", () => {
    expect(invalidFields(RefreshTokenDto, { refreshToken: "r".repeat(43) })).toEqual([]);
  });

  // Far longer than any token the package hands out. It cannot be one.
  it("accepts 1000 characters and rejects 1001", () => {
    expect(invalidFields(RefreshTokenDto, { refreshToken: "r".repeat(1000) })).toEqual([]);
    expect(invalidFields(RefreshTokenDto, { refreshToken: "r".repeat(1001) })).toEqual([
      "refreshToken",
    ]);
  });

  it.each([
    ["an empty string", ""],
    ["a number", 42],
    ["an array", ["r".repeat(43)]],
    ["nothing", undefined],
  ])("rejects %s", (_what, refreshToken) => {
    expect(invalidFields(RefreshTokenDto, { refreshToken })).toEqual(["refreshToken"]);
  });
});

describe("EmailDto", () => {
  it.each(["walter@example.com", "WALTER@EXAMPLE.COM"])("accepts %s", (email) => {
    expect(invalidFields(EmailDto, { email })).toEqual([]);
  });

  it("trims the spaces around the email", () => {
    const dto = plainToInstance(EmailDto, { email: " walter@example.com \n" });

    expect(dto.email).toBe("walter@example.com");
    expect(validateSync(dto)).toEqual([]);
  });

  it.each([
    ["a username", "walter"],
    ["an empty string", ""],
    ["only spaces", "   "],
    ["a number", 42],
    ["nothing", undefined],
    // Past the 100 the column holds. No account can have it.
    ["an address longer than the column", `${"a".repeat(60)}@${"b".repeat(60)}.com`],
  ])("rejects %s", (_what, email) => {
    expect(invalidFields(EmailDto, { email })).toEqual(["email"]);
  });
});

describe("ResetPasswordDto", () => {
  const valid = { token: "t".repeat(43), password: "a-long-secret-1" };

  it("accepts a token and a password", () => {
    expect(invalidFields(ResetPasswordDto, valid)).toEqual([]);
  });

  describe("token", () => {
    it.each([
      ["an empty string", ""],
      ["a number", 42],
      ["nothing", undefined],
      ["1001 characters", "t".repeat(1001)],
    ])("rejects %s", (_what, token) => {
      expect(invalidFields(ResetPasswordDto, { ...valid, token })).toEqual(["token"]);
    });

    // No rule about its shape. A token that was never issued is not found,
    // and gets the same 400 as an expired one.
    it("accepts any other text, and leaves it to the lookup", () => {
      expect(invalidFields(ResetPasswordDto, { ...valid, token: "not a real token" })).toEqual([]);
    });
  });

  describe("password", () => {
    // The sign-up rule, as in the NestJS docs.
    it("accepts 12 characters and rejects 11", () => {
      expect(invalidFields(ResetPasswordDto, { ...valid, password: "a".repeat(12) })).toEqual([]);
      expect(invalidFields(ResetPasswordDto, { ...valid, password: "a".repeat(11) })).toEqual([
        "password",
      ]);
    });

    it("accepts 128 characters and rejects 129", () => {
      expect(invalidFields(ResetPasswordDto, { ...valid, password: "a".repeat(128) })).toEqual([]);
      expect(invalidFields(ResetPasswordDto, { ...valid, password: "a".repeat(129) })).toEqual([
        "password",
      ]);
    });

    it.each([
      ["a number", 123456],
      ["nothing", undefined],
    ])("rejects %s", (_what, password) => {
      expect(invalidFields(ResetPasswordDto, { ...valid, password })).toEqual(["password"]);
    });
  });
});
