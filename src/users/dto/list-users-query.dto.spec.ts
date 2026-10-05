import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { ListUsersQueryDto } from "./list-users-query.dto.js";

describe("ListUsersQueryDto", () => {
  it("should be defined", () => {
    expect(new ListUsersQueryDto()).toBeDefined();
  });

  it("rejects page 0", async () => {
    const dto = plainToInstance(ListUsersQueryDto, { page: "0" });
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
  });

  it("defaults to limit 10 and page 1", () => {
    expect(plainToInstance(ListUsersQueryDto, {})).toMatchObject({ limit: 10, page: 1 });
  });
});
