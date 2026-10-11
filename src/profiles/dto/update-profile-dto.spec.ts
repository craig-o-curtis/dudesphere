import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { UpdateProfileDto } from "./update-profile-dto.js";

describe("UpdateProfileDto", () => {
  async function invalidFields(body: object) {
    return (await validate(plainToInstance(UpdateProfileDto, body))).map((error) => error.property);
  }

  it("accepts an empty body: every field is optional", async () => {
    expect(await invalidFields({})).toEqual([]);
  });

  it("accepts a valid value for isDude", async () => {
    expect(await invalidFields({ isDude: true })).toEqual([]);
  });

  // The column is NOT NULL. A null that passed validation reached Postgres
  // and came back as a 500.
  it("rejects null for isDude", async () => {
    expect(await invalidFields({ isDude: null })).toEqual(["isDude"]);
  });

  // These columns are nullable, and null is how a client clears one.
  it.each(["bio", "profileImageUrl", "ordainedDate"])("accepts null for %s", async (field) => {
    expect(await invalidFields({ [field]: null })).toEqual([]);
  });

  // Required at sign up, optional here: a member may edit their bio without
  // sending their name again. The column is NOT NULL, so null is refused.
  describe("displayName", () => {
    it("accepts a new name", async () => {
      expect(await invalidFields({ displayName: "El Duderino" })).toEqual([]);
    });

    it("rejects null", async () => {
      expect(await invalidFields({ displayName: null })).toEqual(["displayName"]);
    });

    it("cleans it the way sign up does", () => {
      const dto = plainToInstance(UpdateProfileDto, { displayName: "  El   Duderino " });

      expect(dto.displayName).toBe("El Duderino");
    });
  });
});
