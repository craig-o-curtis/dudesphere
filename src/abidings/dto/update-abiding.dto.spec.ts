import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { UpdateAbidingDto } from "./update-abiding.dto.js";

describe("UpdateAbidingDto", () => {
  const invalidFields = async (body: object) =>
    (await validate(plainToInstance(UpdateAbidingDto, body))).map((error) => error.property);

  it("accepts an empty body: every field is optional", async () => {
    expect(await invalidFields({})).toEqual([]);
  });

  it("accepts a new message", async () => {
    expect(await invalidFields({ message: "The Dude abides" })).toEqual([]);
  });

  // A null message used to pass and be quietly ignored, so the caller got a
  // 200 for an edit that changed nothing.
  it("rejects null for message", async () => {
    expect(await invalidFields({ message: null })).toEqual(["message"]);
  });

  it("rejects an empty message", async () => {
    expect(await invalidFields({ message: "" })).toEqual(["message"]);
  });

  it.each(["imageUrl", "replyToId"])("accepts null for %s", async (field) => {
    expect(await invalidFields({ [field]: null })).toEqual([]);
  });
});
