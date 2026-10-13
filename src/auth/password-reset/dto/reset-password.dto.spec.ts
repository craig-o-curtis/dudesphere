import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";

import { ForgotPasswordDto } from "./forgot-password.dto.js";
import { ResetPasswordDto } from "./reset-password.dto.js";

// plainToInstance, as ValidationPipe does with transform: true, so a
// @Transform runs before the rules do.
function invalidFields(dto: new () => object, body: Record<string, unknown>): string[] {
  return validateSync(plainToInstance(dto, body)).map((error) => error.property);
}

describe("ForgotPasswordDto", () => {
  it.each(["dude@example.com", "DUDE@EXAMPLE.COM"])("accepts %s", (email) => {
    expect(invalidFields(ForgotPasswordDto, { email })).toEqual([]);
  });

  it("trims the spaces around the email", () => {
    const dto = plainToInstance(ForgotPasswordDto, { email: " dude@example.com \n" });

    expect(dto.email).toBe("dude@example.com");
    expect(validateSync(dto)).toEqual([]);
  });

  it.each([
    ["a username", "dude"],
    ["an empty string", ""],
    ["a number", 42],
    ["nothing", undefined],
    // Past the 100 the column holds. No account can have it.
    ["an address longer than the column", `${"a".repeat(60)}@${"b".repeat(60)}.com`],
  ])("rejects %s", (_what, email) => {
    expect(invalidFields(ForgotPasswordDto, { email })).toEqual(["email"]);
  });
});

describe("ResetPasswordDto", () => {
  const valid = { token: "a".repeat(43), password: "secret1", confirmPassword: "secret1" };

  it("accepts a token, a password and the password again", () => {
    expect(invalidFields(ResetPasswordDto, valid)).toEqual([]);
  });

  describe("token", () => {
    it.each([
      ["an empty string", ""],
      ["a number", 42],
      ["nothing", undefined],
      ["201 characters", "a".repeat(201)],
    ])("rejects %s", (_what, token) => {
      expect(invalidFields(ResetPasswordDto, { ...valid, token })).toEqual(["token"]);
    });

    // No rule about its shape. A token that was never issued is not found,
    // and gets the same 400 as an expired one.
    it("accepts any other text, and leaves it to the lookup", () => {
      expect(invalidFields(ResetPasswordDto, { ...valid, token: "not a real token" })).toEqual([]);
    });
  });

  // The same rules as at sign-up, so a reset cannot set a password that
  // sign-up would refuse.
  describe("password", () => {
    it.each([
      ["5 characters", "abcde"],
      ["73 bytes", "a".repeat(73)],
      // 25 characters, 75 bytes.
      ["75 bytes in 25 characters", "€".repeat(25)],
    ])("rejects %s", (_what, password) => {
      expect(
        invalidFields(ResetPasswordDto, { ...valid, password, confirmPassword: password }),
      ).toEqual(["password"]);
    });

    it("accepts 72 bytes", () => {
      const password = "a".repeat(72);

      expect(
        invalidFields(ResetPasswordDto, { ...valid, password, confirmPassword: password }),
      ).toEqual([]);
    });
  });

  describe("confirmPassword", () => {
    it("rejects a value that differs from password", () => {
      expect(invalidFields(ResetPasswordDto, { ...valid, confirmPassword: "secret2" })).toEqual([
        "confirmPassword",
      ]);
    });

    it("rejects a body without it", () => {
      const { confirmPassword: _confirmPassword, ...body } = valid;

      expect(invalidFields(ResetPasswordDto, body)).toEqual(["confirmPassword"]);
    });
  });
});
