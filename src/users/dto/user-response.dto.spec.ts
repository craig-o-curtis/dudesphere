import { UserResponseDto } from "./user-response.dto.js";

describe("UserResponseDto", () => {
  it("should be defined", () => {
    expect(new UserResponseDto({})).toBeDefined();
  });
});
