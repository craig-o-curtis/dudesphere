import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { MAX_LIMIT, MAX_PAGE, PaginationQueryDto } from "./pagination-query.dto.js";

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

  it("accepts the largest limit it allows and rejects the one after", async () => {
    const largest = plainToInstance(PaginationQueryDto, { limit: String(MAX_LIMIT) });
    const tooMany = plainToInstance(PaginationQueryDto, { limit: String(MAX_LIMIT + 1) });

    expect(await validate(largest)).toHaveLength(0);
    expect(largest.limit).toBe(MAX_LIMIT);
    expect(await validate(tooMany)).toHaveLength(1);
  });

  it("defaults to limit 10 and page 1", () => {
    expect(plainToInstance(PaginationQueryDto, {})).toMatchObject({ limit: 10, page: 1 });
  });

  // A missing key never reaches the @Transform. A key that is present with no
  // value does, and the transform has to hand the default back.
  it("keeps the defaults when a key is present but undefined", async () => {
    const dto = plainToInstance(PaginationQueryDto, { limit: undefined, page: undefined });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto).toMatchObject({ limit: 10, page: 1 });
  });

  // Number() reads all of these as a number. One page should have one
  // spelling, so only plain digits pass.
  it.each(["0x10", "1e1", "+5", " 5", "5 ", "", "5.0"])(
    "rejects limit %j, which is not plain digits",
    async (limit) => {
      const dto = plainToInstance(PaginationQueryDto, { limit });

      expect(await validate(dto)).toHaveLength(1);
    },
  );

  // ?page=1&page=2 reaches the DTO as an array.
  it("rejects a repeated param", async () => {
    const dto = plainToInstance(PaginationQueryDto, { page: ["1", "2"] });

    expect(await validate(dto)).toHaveLength(1);
  });

  it("rejects an array holding one value", async () => {
    const dto = plainToInstance(PaginationQueryDto, { limit: ["5"] });

    expect(await validate(dto)).toHaveLength(1);
  });
});
