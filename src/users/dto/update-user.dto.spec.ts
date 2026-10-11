import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { UpdateMyUserDto } from "./update-my-user.dto.js";
import { UpdateUserDto } from "./update-user.dto.js";

/** The names of the fields that failed validation. */
async function invalidFields(dto: object): Promise<string[]> {
  return (await validate(dto)).map((error) => error.property);
}

describe("UpdateUserDto", () => {
  function check(body: object) {
    return invalidFields(plainToInstance(UpdateUserDto, body));
  }

  it("accepts an empty body: every field is optional", async () => {
    expect(await check({})).toEqual([]);
  });

  it("accepts a valid value for one field", async () => {
    expect(await check({ username: "walter" })).toEqual([]);
  });

  // The columns are NOT NULL. A null that passed validation reached Postgres
  // and came back as a 500, or reached the password hasher and threw there.
  it.each(["username", "email", "password"])("rejects null for %s", async (field) => {
    expect(await check({ [field]: null })).toEqual([field]);
  });

  // profile is not a column on user, and it is not a field here. A profile
  // is edited through /profiles. The app's ValidationPipe runs with these two
  // options, so a profile sent to PATCH /users/me is a 400, not ignored.
  it("has no profile field, so one is refused as unknown", async () => {
    const errors = await validate(
      plainToInstance(UpdateUserDto, { profile: { displayName: "The Dude" } }),
      { whitelist: true, forbidNonWhitelisted: true },
    );

    expect(errors.map((error) => error.property)).toEqual(["profile"]);
    expect(errors[0].constraints).toHaveProperty("whitelistValidation");
  });
});

describe("UpdateMyUserDto", () => {
  function check(body: object) {
    return invalidFields(plainToInstance(UpdateMyUserDto, body));
  }

  it("accepts a new password with the current one", async () => {
    expect(await check({ password: "secret2", currentPassword: "secret1" })).toEqual([]);
  });

  // Missing is fine here. UsersService decides whether it was needed.
  it("accepts a body with no currentPassword", async () => {
    expect(await check({ username: "walter" })).toEqual([]);
  });

  it("rejects null for currentPassword", async () => {
    expect(await check({ password: "secret2", currentPassword: null })).toEqual([
      "currentPassword",
    ]);
  });
});
