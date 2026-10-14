import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { MAX_TAGS } from "../../shared/utils/hashtag.js";
import { GetAbidingsDto } from "./get-abidings.dto.js";

// GetAbidingsDto is two classes joined with IntersectionType: the route's own
// filters and PaginationQueryDto. Each decorator has a spec of its own. This
// one checks the join: that every field is still there, with its conversion,
// its rules and its default, and that one field's rule does not leak into
// another.
describe("GetAbidingsDto", () => {
  // The query as it arrives: every value is a string.
  async function check(query: object) {
    const dto = plainToInstance(GetAbidingsDto, query);
    const invalid = (await validate(dto)).map((error) => error.property).sort();
    return { dto, invalid };
  }

  function tags(count: number) {
    return Array.from({ length: count }, (_, index) => `tag${index}`).join(",");
  }

  it("accepts an empty query: every filter is optional", async () => {
    const { dto, invalid } = await check({});

    expect(invalid).toEqual([]);
    expect(dto).toBeInstanceOf(GetAbidingsDto);
  });

  it("leaves a filter that was not sent undefined", async () => {
    const { dto } = await check({});

    expect(dto.userId).toBeUndefined();
    expect(dto.hashtag).toBeUndefined();
    expect(dto.startDate).toBeUndefined();
    expect(dto.endDate).toBeUndefined();
  });

  it("accepts every filter at once", async () => {
    const { dto, invalid } = await check({
      limit: "5",
      page: "2",
      userId: "3",
      hashtag: "dude,sunday",
      startDate: "2026-10-01T00:00:00Z",
      endDate: "2026-10-08T00:00:00Z",
    });

    expect(invalid).toEqual([]);
    expect(dto).toMatchObject({
      limit: 5,
      page: 2,
      userId: 3,
      hashtag: "dude,sunday",
      startDate: "2026-10-01T00:00:00Z",
      endDate: "2026-10-08T00:00:00Z",
    });
  });

  // These two come from PaginationQueryDto. IntersectionType has to carry
  // across their defaults and their decorators, not only their names.
  describe("limit and page", () => {
    it("default to 10 and 1", async () => {
      const { dto, invalid } = await check({});

      expect(invalid).toEqual([]);
      expect(dto).toMatchObject({ limit: 10, page: 1 });
    });

    // A missing key never reaches the @Transform. A key that is present with
    // no value does, and the transform has to hand the default back.
    it("keep their defaults when the key is present but undefined", async () => {
      const { dto, invalid } = await check({ limit: undefined, page: undefined });

      expect(invalid).toEqual([]);
      expect(dto).toMatchObject({ limit: 10, page: 1 });
    });

    it("are converted from strings to numbers", async () => {
      const { dto } = await check({ limit: "5", page: "2" });

      expect(dto.limit).toBe(5);
      expect(dto.page).toBe(2);
    });

    it.each([
      [{ limit: "0" }, "limit"],
      [{ limit: "101" }, "limit"],
      [{ limit: "0x10" }, "limit"],
      [{ limit: "abc" }, "limit"],
      [{ page: "0" }, "page"],
      [{ page: "1e1" }, "page"],
    ])("reject %j", async (query, field) => {
      expect((await check(query)).invalid).toEqual([field]);
    });
  });

  describe("userId", () => {
    it("is converted from a string to a number", async () => {
      const { dto, invalid } = await check({ userId: "3" });

      expect(invalid).toEqual([]);
      expect(dto.userId).toBe(3);
    });

    // Number() reads "0x10", "1e1" and "+5" as numbers. Only plain digits pass.
    it.each(["0", "-1", "0x10", "1e1", "+5", "abc", ""])("rejects %j", async (userId) => {
      expect((await check({ userId })).invalid).toEqual(["userId"]);
    });
  });

  describe("hashtag", () => {
    it.each(["dude", "#dude", "dude,sunday", "#dude, #sunday"])("accepts %j", async (hashtag) => {
      const { dto, invalid } = await check({ hashtag });

      expect(invalid).toEqual([]);
      // Kept as it was sent. The controller splits it and the service
      // normalizes each tag.
      expect(dto.hashtag).toBe(hashtag);
    });

    it(`accepts ${MAX_TAGS} tags and rejects ${MAX_TAGS + 1}`, async () => {
      expect((await check({ hashtag: tags(MAX_TAGS) })).invalid).toEqual([]);
      expect((await check({ hashtag: tags(MAX_TAGS + 1) })).invalid).toEqual(["hashtag"]);
    });

    // ?hashtag=a&hashtag=b reaches the DTO as an array.
    it("rejects a repeated param", async () => {
      expect((await check({ hashtag: ["dude", "sunday"] })).invalid).toEqual(["hashtag"]);
    });
  });

  describe.each(["startDate", "endDate"] as const)("%s", (field) => {
    it.each(["2026-10-01T00:00:00Z", "2026-10-01T00:00:00.123Z"])(
      "accepts the UTC instant %s and keeps it a string",
      async (value) => {
        const { dto, invalid } = await check({ [field]: value });

        expect(invalid).toEqual([]);
        expect(dto[field]).toBe(value);
      },
    );

    // The full list of refused shapes is in is-utc-date-time.decorator.spec.ts.
    // These show the decorator is on this field.
    it.each([
      ["a date with no time", "2026-10-01"],
      ["a day that does not exist", "2026-02-30T00:00:00Z"],
      ["an offset other than Z", "2026-10-01T00:00:00+03:00"],
      ["a word", "yesterday"],
      ["an empty value", ""],
    ])("rejects %s", async (_what, value) => {
      expect((await check({ [field]: value })).invalid).toEqual([field]);
    });
  });

  // The DTO checks each date alone. Comparing the two is the service's job:
  // see sharedFilter in abidings.service.ts, which answers this with a 400.
  it("does not compare startDate with endDate", async () => {
    const { invalid } = await check({
      startDate: "2026-10-08T00:00:00Z",
      endDate: "2026-10-01T00:00:00Z",
    });

    expect(invalid).toEqual([]);
  });

  it("names every bad field, not only the first", async () => {
    const { invalid } = await check({
      limit: "0",
      userId: "abc",
      hashtag: tags(MAX_TAGS + 1),
      startDate: "yesterday",
    });

    expect(invalid).toEqual(["hashtag", "limit", "startDate", "userId"]);
  });

  // The global ValidationPipe in src/app-setup.ts runs with these two options.
  // With them a query param the DTO does not declare is a 400, so a typo such
  // as ?startdate= is refused and not silently ignored.
  it("refuses a param it does not declare, under the pipe's options", async () => {
    const dto = plainToInstance(GetAbidingsDto, { startdate: "2026-10-01T00:00:00Z" });

    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });

    expect(errors.map((error) => error.property)).toEqual(["startdate"]);
  });
});
