import { plainToInstance } from "class-transformer";
import { isEmail, maxLength, validateSync } from "class-validator";

import { columnLimits } from "../../../test/column-limits.js";
import { CreateProfileDto } from "../../profiles/dto/create-profile-dto.js";
import { User } from "../user.entity.js";
import { CreateUserDto } from "./create-user.dto.js";

/**
 * The most characters a User column holds. username and email are citext,
 * which has no length, so the entity declares each limit as a CHECK.
 */
function columnLength(propertyName: string): number {
  const length = columnLimits(User).get(propertyName);
  if (length === undefined) {
    throw new Error(`User.${propertyName} has no declared length`);
  }
  return length;
}

/** Builds a syntactically valid value of exactly `length` characters. */
const valueOfLength: Record<string, (length: number) => string> = {
  username: (length) => "a".repeat(length),
  // The local part is held at 60 to stay inside the 64-character cap isEmail
  // enforces, so the domain absorbs the rest of the length.
  email: (length) => `${"a".repeat(60)}@${"b".repeat(length - 65)}.com`,
};

function buildDto(overrides: Partial<CreateUserDto>): CreateUserDto {
  return Object.assign(new CreateUserDto(), {
    username: "dude",
    email: "dude@example.com",
    password: "secret1",
    // An instance, not a plain object: Object.assign runs no @Type, and
    // @ValidateNested refuses a nested value that is not a class instance.
    profile: Object.assign(new CreateProfileDto(), { displayName: "The Dude" }),
    ...overrides,
  });
}

const sizedFields = ["username", "email"] as const;

describe("CreateUserDto", () => {
  it("should be defined", () => {
    expect(new CreateUserDto()).toBeDefined();
  });

  // Keeps the DTO in sync with the entity. A value the DTO accepts but the
  // column cannot hold reaches Postgres and fails there as a 500 instead of
  // being rejected as a 400.
  it.each(sizedFields)("accepts a %s that exactly fills the column", (field) => {
    const value = valueOfLength[field](columnLength(field));

    const errors = validateSync(buildDto({ [field]: value }));

    expect(errors.filter((error) => error.property === field)).toEqual([]);
  });

  it.each(sizedFields)("rejects a %s one character past the column", (field) => {
    const value = valueOfLength[field](columnLength(field) + 1);

    const errors = validateSync(buildDto({ [field]: value }));

    expect(errors.map((error) => error.property)).toContain(field);
  });

  // A variation selector is an invisible code point that follows some
  // characters. @MaxLength left it out of its count and Postgres counts it,
  // so these values passed the DTO and overflowed the column. Each is valid
  // in every other way, so only the length rule can reject it.
  describe("a value that is only short if variation selectors are left out", () => {
    const WITH_SELECTOR = "a\uFE0F";

    it("rejects such a username", () => {
      // 13 letters to @MaxLength, 26 characters to the column's limit of 24.
      const username = WITH_SELECTOR.repeat(13);
      expect(maxLength(username, columnLength("username"))).toBe(true);

      const errors = validateSync(buildDto({ username }));

      expect(errors.map((error) => error.property)).toEqual(["username"]);
    });

    it("rejects such an email", () => {
      // 71 to @MaxLength, 131 characters to the column's limit of 100.
      const label = "b\uFE0F".repeat(30);
      const email = `aaaaa@${label}.${label}.com`;
      expect(isEmail(email)).toBe(true);
      expect(maxLength(email, columnLength("email"))).toBe(true);

      const errors = validateSync(buildDto({ email }));

      expect(errors.map((error) => error.property)).toEqual(["email"]);
    });
  });

  it("rejects a username that contains a NUL character", () => {
    const errors = validateSync(buildDto({ username: "du\u0000de" }));

    expect(errors.map((error) => error.property)).toEqual(["username"]);
  });

  // Login takes a username or an email in one field and tells them apart by
  // the "@", so a username must never hold one. Login also trims what the
  // caller typed, so a username must not hold whitespace either.
  describe("a username login could not tell from an email, or could not match", () => {
    it.each([
      ["an @", "dude@example.com"],
      ["an @ on its own", "du@de"],
      ["a space inside", "the dude"],
      ["a space at the end", "dude "],
      ["a tab", "du\tde"],
      ["a line break", "du\nde"],
    ])("rejects a username with %s", (_what, username) => {
      const errors = validateSync(buildDto({ username }));

      expect(errors.map((error) => error.property)).toEqual(["username"]);
      expect(errors[0].constraints).toMatchObject({
        matches: "username must not contain spaces or @",
      });
    });

    it.each(["dude", "The_Dude", "el-duderino.99", "dudé"])("accepts %s", (username) => {
      expect(validateSync(buildDto({ username }))).toEqual([]);
    });
  });

  // A profile's display name is required, so the profile is too. These go
  // through plainToInstance, as a request body does, so @Type builds the
  // nested class.
  describe("profile", () => {
    const account = { username: "dude", email: "dude@example.com", password: "secret1" };

    function invalidFields(body: object): string[] {
      return validateSync(plainToInstance(CreateUserDto, body)).map((error) => error.property);
    }

    it("accepts a profile with a display name", () => {
      expect(invalidFields({ ...account, profile: { displayName: "The Dude" } })).toEqual([]);
    });

    it.each([
      ["no profile", account],
      ["a null profile", { ...account, profile: null }],
      ["a profile with no display name", { ...account, profile: { bio: "abides" } }],
      ["a profile that is not an object", { ...account, profile: "The Dude" }],
    ])("rejects %s", (_what, body) => {
      expect(invalidFields(body)).toEqual(["profile"]);
    });
  });

  // The password is not in sizedFields: its column holds a hash of fixed
  // length, so the limit that matters is the one on what is hashed.
  describe("password", () => {
    function passwordErrors(password: string) {
      return validateSync(buildDto({ password })).filter((error) => error.property === "password");
    }

    it("accepts 128 characters and rejects 129", () => {
      expect(passwordErrors("a".repeat(128))).toEqual([]);
      expect(passwordErrors("a".repeat(129))).not.toEqual([]);
    });

    // bcrypt read 72 bytes at most, so the old rule counted bytes. scrypt
    // reads all of it, so an accented password is no shorter than any other.
    it("counts characters, not bytes", () => {
      expect(passwordErrors("é".repeat(128))).toEqual([]);
    });

    it("still rejects fewer than 6 characters", () => {
      expect(passwordErrors("abcde")).not.toEqual([]);
    });
  });
});
