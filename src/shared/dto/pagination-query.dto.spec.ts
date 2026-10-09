import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { PaginationQueryDto } from "./pagination-query.dto.js";

describe("PaginationQueryDto", () => {
  it("should be defined", () => {
    expect(new PaginationQueryDto()).toBeDefined();
  });

  it("rejects page 0", async () => {
    const dto = plainToInstance(PaginationQueryDto, { page: "0" });
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
  });

  it("defaults to limit 10 and page 1", () => {
    expect(plainToInstance(PaginationQueryDto, {})).toMatchObject({ limit: 10, page: 1 });
  });
});
