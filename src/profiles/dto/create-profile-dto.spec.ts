import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { CreateProfileDto } from "./create-profile-dto.js";

describe("CreateProfileDto", () => {
  const invalidFields = async (body: object) =>
    (await validate(plainToInstance(CreateProfileDto, body))).map((error) => error.property);

  it("accepts an empty body: a profile starts with defaults", async () => {
    expect(await invalidFields({})).toEqual([]);
  });

  it("rejects null for isDude, which its column cannot hold", async () => {
    expect(await invalidFields({ isDude: null })).toEqual(["isDude"]);
  });

  it("accepts null for a nullable field", async () => {
    expect(await invalidFields({ firstName: null })).toEqual([]);
  });
});
