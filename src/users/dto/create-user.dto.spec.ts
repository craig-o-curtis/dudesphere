import { isEmail, maxLength, validateSync } from "class-validator";
import { getMetadataArgsStorage } from "typeorm";

import { User } from "../user.entity.js";
import { CreateUserDto } from "./create-user.dto.js";

/** The varchar length declared on a User column. */
function columnLength(propertyName: string): number {
  const column = getMetadataArgsStorage().columns.find(
    (candidate) => candidate.target === User && candidate.propertyName === propertyName,
  );
  const length = column?.options.length;
  if (length === undefined) {
    throw new Error(`User.${propertyName} has no declared length`);
  }
  return Number(length);
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
      // 13 letters to @MaxLength, 26 characters to varchar(24).
      const username = WITH_SELECTOR.repeat(13);
      expect(maxLength(username, columnLength("username"))).toBe(true);

      const errors = validateSync(buildDto({ username }));

      expect(errors.map((error) => error.property)).toEqual(["username"]);
    });

    it("rejects such an email", () => {
      // 71 to @MaxLength, 131 characters to varchar(100).
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

  // The password is not in sizedFields: its column holds a 60-character hash,
  // so the limit that matters is bcrypt's 72 bytes of input, not the column.
  describe("password", () => {
    function passwordErrors(password: string) {
      return validateSync(buildDto({ password })).filter((error) => error.property === "password");
    }

    it("accepts 72 bytes and rejects 73", () => {
      expect(passwordErrors("a".repeat(72))).toEqual([]);
      expect(passwordErrors("a".repeat(73))).not.toEqual([]);
    });

    // "é" is 2 bytes, so 36 of them is 72 bytes and 37 is 74. A rule that
    // counted characters would let 72 of them through, which is 144 bytes.
    it("counts bytes, not characters", () => {
      expect(passwordErrors("é".repeat(36))).toEqual([]);
      expect(passwordErrors("é".repeat(37))).not.toEqual([]);
    });

    it("still rejects fewer than 6 characters", () => {
      expect(passwordErrors("abcde")).not.toEqual([]);
    });
  });
});
