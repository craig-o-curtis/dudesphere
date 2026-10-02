import { validateSync } from "class-validator";
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
});
