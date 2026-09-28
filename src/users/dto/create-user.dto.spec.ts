import { CreateUserDto } from "./create-user.dto.js";

describe("CreateUserDto", () => {
  it("should be defined", () => {
    expect(new CreateUserDto()).toBeDefined();
  });

  // if possible a unit test to ensure the user.entity and create-user.dto.ts are in sync
});
