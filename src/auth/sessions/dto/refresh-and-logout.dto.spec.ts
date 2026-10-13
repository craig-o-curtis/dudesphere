import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";

import { LogoutDto } from "./logout.dto.js";
import { RefreshDto } from "./refresh.dto.js";

// The two routes take the same body, { refreshToken }, under the same rules.
// Each case below runs against both, so the two classes cannot drift apart.
describe.each([
  ["RefreshDto", RefreshDto],
  ["LogoutDto", LogoutDto],
])("%s", (_name, Dto) => {
  function invalidFields(body: Record<string, unknown>): string[] {
    return validateSync(plainToInstance(Dto, body)).map((error) => error.property);
  }

  it("accepts a token of the real length", () => {
    expect(invalidFields({ refreshToken: "a".repeat(43) })).toEqual([]);
  });

  // The DTO has no rule about a token's shape. A string that is not a token
  // we issued passes here and is left to SessionsService: a 401 from refresh,
  // the same answer as for a used or expired one, and a 204 from logout.
  it("accepts a string that is not a real token, and leaves it to the service", () => {
    expect(invalidFields({ refreshToken: "not-a-token" })).toEqual([]);
  });

  // An access token is a few hundred characters. A client that sends the
  // wrong one of its two tokens must get the service's answer, not a 400.
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
