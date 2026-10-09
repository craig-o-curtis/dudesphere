import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { model } from "mongoose";

import { ABIDING_MESSAGE_MAX, AbidingSchema } from "./abiding.schema.js";
import { CreateAbidingDto } from "./dto/create-abiding.dto.js";

// The schema and the DTO each limit the message. They once counted in
// different ways: the DTO let 200 emoji through and the schema then refused
// them, which reached the caller as a 500. These tests hold the two to the
// same answer for the strings that told them apart.
//
// No database is needed. A document validates itself before anything is sent.
describe("Abiding schema: message length", () => {
  const AbidingModel = model("AbidingSchemaSpec", AbidingSchema);

  const schemaAccepts = async (message: string) => {
    const error: unknown = await new AbidingModel({ userId: 1, message })
      .validate()
      .then(() => null)
      .catch((reason: unknown) => reason);
    return error === null;
  };

  const dtoAccepts = async (message: string) => {
    const errors = await validate(plainToInstance(CreateAbidingDto, { message }));
    return errors.length === 0;
  };

  // One visible character each, but more than one UTF-16 unit, and for the
  // heart more than one code point.
  const EMOJI = "😀";
  const RED_HEART = "❤️";

  it.each([
    ["letters", "a"],
    ["emoji", EMOJI],
    ["red hearts", RED_HEART],
  ])("accepts %s up to the limit and refuses one more", async (_what, character) => {
    expect(await schemaAccepts(character.repeat(ABIDING_MESSAGE_MAX))).toBe(true);
    expect(await schemaAccepts(character.repeat(ABIDING_MESSAGE_MAX + 1))).toBe(false);
  });

  it.each([
    ["letters", "a"],
    ["emoji", EMOJI],
    ["red hearts", RED_HEART],
  ])("agrees with the DTO about %s at the limit and one past it", async (_what, character) => {
    for (const count of [ABIDING_MESSAGE_MAX, ABIDING_MESSAGE_MAX + 1]) {
      const message = character.repeat(count);

      expect(await schemaAccepts(message)).toBe(await dtoAccepts(message));
    }
  });

  it("still refuses an empty message", async () => {
    expect(await schemaAccepts("")).toBe(false);
  });
});

describe("Abiding schema: fields", () => {
  // The schema once had a username field that only the seed wrote. A stored
  // copy of the author's name goes stale when they rename, so responses read
  // the current one from Postgres, and the copy was never used.
  it("keeps no copy of the author's username", () => {
    expect(AbidingSchema.path("username")).toBeUndefined();
  });
});
