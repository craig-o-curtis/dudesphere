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

  describe("ordainedDate", () => {
    it("accepts an instant in UTC", async () => {
      expect(await invalidFields({ ordainedDate: "2026-10-06T12:00:00.000Z" })).toEqual([]);
    });

    // Each of these used to pass. The week date then failed in Postgres as a
    // 500, and the others were stored as a different day from the one sent.
    it.each(["2026-W12", "2026-02-30", "2026", "2026-10-06"])("rejects %s", async (value) => {
      expect(await invalidFields({ ordainedDate: value })).toEqual(["ordainedDate"]);
    });
  });

  it.each(["firstName", "lastName", "bio", "profileImageUrl"])(
    "rejects a NUL character in %s",
    async (field) => {
      expect(await invalidFields({ [field]: "ab\u0000cd" })).toEqual([field]);
    },
  );
});
