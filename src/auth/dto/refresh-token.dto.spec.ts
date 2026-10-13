import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";

import { RefreshTokenDto } from "./refresh-token.dto.js";

function invalidFields(body: Record<string, unknown>): string[] {
  return validateSync(plainToInstance(RefreshTokenDto, body)).map((error) => error.property);
}

describe("RefreshTokenDto", () => {
  it("accepts a token of the real length", () => {
    expect(invalidFields({ refreshToken: "a".repeat(43) })).toEqual([]);
  });

  // The DTO has no rule about a token's shape. A string that is not a token
  // we issued passes here and gets a 401 from SessionsService, the same answer
  // as a used or expired one.
  it("accepts a string that is not a real token, and leaves it to the service", () => {
    expect(invalidFields({ refreshToken: "not-a-token" })).toEqual([]);
  });

  // An access token is a few hundred characters. A client that sends the
  // wrong one of its two tokens must get the service's 401, not a 400.
  it("accepts a value as long as an access token", () => {
    expect(invalidFields({ refreshToken: "a".repeat(400) })).toEqual([]);
  });

  it.each([
    ["missing", {}],
    ["an empty string", { refreshToken: "" }],
    ["a number", { refreshToken: 42 }],
    ["null", { refreshToken: null }],
    // Far longer than any token of either kind.
    ["1001 characters", { refreshToken: "a".repeat(1001) }],
  ])("refuses a refreshToken that is %s", (_what, body) => {
    expect(invalidFields(body)).toEqual(["refreshToken"]);
  });
});
