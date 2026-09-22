import { CreateUserDto } from "./create-user.dto.js";

describe("CreateUserDto", () => {
  it("should be defined", () => {
    expect(new CreateUserDto()).toBeDefined();
  });
});
