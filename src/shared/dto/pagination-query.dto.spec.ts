import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { MAX_PAGE, PaginationQueryDto } from "./pagination-query.dto.js";

describe("PaginationQueryDto", () => {
  it("should be defined", () => {
    expect(new PaginationQueryDto()).toBeDefined();
  });

  it("rejects page 0", async () => {
    const dto = plainToInstance(PaginationQueryDto, { page: "0" });
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
  });

  it("accepts the last page it allows and rejects the one after", async () => {
    const last = plainToInstance(PaginationQueryDto, { page: String(MAX_PAGE) });
    const tooFar = plainToInstance(PaginationQueryDto, { page: String(MAX_PAGE + 1) });

    expect(await validate(last)).toHaveLength(0);
    expect(await validate(tooFar)).toHaveLength(1);
  });

  it("defaults to limit 10 and page 1", () => {
    expect(plainToInstance(PaginationQueryDto, {})).toMatchObject({ limit: 10, page: 1 });
  });
});
