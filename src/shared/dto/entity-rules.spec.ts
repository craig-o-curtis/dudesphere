import { plainToInstance } from "class-transformer";
import { getMetadataStorage, validate } from "class-validator";
import { getMetadataArgsStorage } from "typeorm";

import { UpdateProfileDto } from "../../profiles/dto/update-profile-dto.js";
import { Profile } from "../../profiles/profile.entity.js";
import { UpdateUserDto } from "../../users/dto/update-user.dto.js";
import { User } from "../../users/user.entity.js";

// Guard tests. They read the rules from the entity, not from a list kept in
// this file, so a new column or a new DTO field is covered without anyone
// remembering to add a case.
//
// Each one stands for a bug this codebase has had: a value the DTO accepted
// that the column could not hold, which reached Postgres and failed there as
// a 500.

type Class = abstract new (...args: never[]) => object;

const pairs: [name: string, dto: new () => object, entity: Class][] = [
  ["UpdateUserDto", UpdateUserDto, User],
  ["UpdateProfileDto", UpdateProfileDto, Profile],
];

/** The fields a DTO validates, read from class-validator's own records. */
function dtoFields(dto: new () => object): Set<string> {
  const rules = getMetadataStorage().getTargetValidationMetadatas(dto, "", true, false);
  return new Set(rules.map((rule) => rule.propertyName));
}

/** The entity's columns that the DTO also has a field for. */
function sharedColumns(dto: new () => object, entity: Class) {
  const fields = dtoFields(dto);
  return getMetadataArgsStorage().columns.filter(
    (column) => column.target === entity && fields.has(column.propertyName),
  );
}

async function invalidFields(dto: new () => object, body: object): Promise<string[]> {
  return (await validate(plainToInstance(dto, body))).map((error) => error.property);
}

describe.each(pairs)("%s follows its entity", (_name, dto, entity) => {
  it("shares at least one column with the entity", () => {
    // Without this, a rename that broke the lookup would leave every test
    // below with nothing to check, and they would all pass.
    expect(sharedColumns(dto, entity).length).toBeGreaterThan(0);
  });

  it("rejects null exactly where the column is NOT NULL", async () => {
    for (const column of sharedColumns(dto, entity)) {
      const field = column.propertyName;
      const rejected = (await invalidFields(dto, { [field]: null })).includes(field);

      // A column is NOT NULL unless it says nullable: true.
      const columnAllowsNull = column.options.nullable === true;
      expect({ field, rejectsNull: rejected }).toEqual({ field, rejectsNull: !columnAllowsNull });
    }
  });
});
