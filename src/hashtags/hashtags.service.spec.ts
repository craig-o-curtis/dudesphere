import { NotFoundException } from "@nestjs/common";
import { getModelToken } from "@nestjs/mongoose";
import { Test, TestingModule } from "@nestjs/testing";
import { getUtcNow } from "@northguild/gmt";

import { Hashtag } from "./hashtag.schema.js";
import { HashtagsService } from "./hashtags.service.js";

// TODO CC new gmt version with issue https://github.com/northguild/gmt/issues/303 will fix this, once v1.19.0 releases we pull in and remove all of this
// Mocked so the "" failure case is reachable. getUtcNow's own output format
// is gmt's contract to keep, not this service's, so these tests assert that
// whatever it returns is written through unchanged.

vi.mock("@northguild/gmt", () => ({
  getUtcNow: vi.fn(),
}));

// Nanosecond precision, as the real getUtcNow returns.
const UTC_NOW = "2026-10-06T09:25:42.204006202Z";

describe("HashtagsService", () => {
  let service: HashtagsService;

  // find().sort().exec() — the service chains sort before exec.
  const queryOf = <T>(value: T) => ({
    sort: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue(value),
  });

  const hashtagModel = {
    find: vi.fn(),
    findOne: vi.fn(),
    bulkWrite: vi.fn(),
    deleteOne: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    hashtagModel.find.mockReturnValue(queryOf([]));
    hashtagModel.findOne.mockReturnValue(queryOf(null));
    hashtagModel.deleteOne.mockReturnValue(queryOf({ deletedCount: 1 }));
    vi.mocked(getUtcNow).mockReturnValue(UTC_NOW);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HashtagsService,
        { provide: getModelToken(Hashtag.name), useValue: hashtagModel },
      ],
    }).compile();

    service = module.get<HashtagsService>(HashtagsService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("listAll", () => {
    it("returns every tag, sorted by slug for a dropdown", async () => {
      const query = queryOf([
        { slug: "dude", display: "Dude", firstUsedAt: "2026-10-05T00:00:00.000Z" },
        { slug: "sunday", display: "Sunday", firstUsedAt: "2026-10-05T00:00:00.000Z" },
      ]);
      hashtagModel.find.mockReturnValue(query);

      const result = await service.listAll();

      expect(query.sort).toHaveBeenCalledWith({ slug: 1 });
      expect(result.map((h) => h.slug)).toEqual(["dude", "sunday"]);
      expect(result.map((h) => h.display)).toEqual(["Dude", "Sunday"]);
    });
  });

  describe("getBySlug", () => {
    it("normalizes before looking up", async () => {
      await service.getBySlug("#Sunday");

      expect(hashtagModel.findOne).toHaveBeenCalledWith({ slug: "sunday" });
    });

    it("returns null for a slug that can't normalize, without querying", async () => {
      const result = await service.getBySlug("###");

      expect(result).toBeNull();
      expect(hashtagModel.findOne).not.toHaveBeenCalled();
    });

    it("returns null when the tag isn't registered", async () => {
      hashtagModel.findOne.mockReturnValue(queryOf(null));
      hashtagModel.deleteOne.mockReturnValue(queryOf({ deletedCount: 1 }));

      expect(await service.getBySlug("sunday")).toBeNull();
    });
  });

  describe("registerTags", () => {
    it("upserts each tag with $setOnInsert so an existing row is left alone", async () => {
      await service.registerTags(
        new Map([
          ["sunday", "Sunday"],
          ["dude", "Dude"],
        ]),
      );

      const operations = hashtagModel.bulkWrite.mock.calls[0][0];
      expect(operations).toHaveLength(2);
      expect(operations[0].updateOne.filter).toEqual({ slug: "sunday" });
      expect(operations[0].updateOne.upsert).toBe(true);
      expect(operations[0].updateOne.update.$setOnInsert).toEqual(
        expect.objectContaining({ slug: "sunday", display: "Sunday" }),
      );
      // Only $setOnInsert — a $set here would overwrite the first casing
      // every time the tag was used again.
      expect(operations[0].updateOne.update.$set).toBeUndefined();
    });

    it("stamps firstUsedAt with the UTC string getUtcNow returned", async () => {
      await service.registerTags(new Map([["sunday", "Sunday"]]));

      const { firstUsedAt } =
        hashtagModel.bulkWrite.mock.calls[0][0][0].updateOne.update.$setOnInsert;
      // Written through unchanged. A Date round-trip here would drop the
      // nanoseconds gmt provides, and break the repo's no-Date rule.
      expect(firstUsedAt).toBe(UTC_NOW);
    });

    it("does nothing when there are no tags", async () => {
      await service.registerTags(new Map());

      expect(hashtagModel.bulkWrite).not.toHaveBeenCalled();
    });

    // A failed registry write must never cost the user their abiding, so the
    // error is logged and swallowed rather than rethrown.
    it("swallows a write failure", async () => {
      hashtagModel.bulkWrite.mockRejectedValue(new Error("mongo is down"));

      await expect(service.registerTags(new Map([["sunday", "Sunday"]]))).resolves.toBeUndefined();
    });

    // getUtcNow returns "" when it can't read the clock. firstUsedAt is
    // required, so writing anyway would insert an invalid row. Skipping is
    // also why this doesn't throw: a registry problem must not fail the post.
    it("skips the write when the clock can't be read, without throwing", async () => {
      vi.mocked(getUtcNow).mockReturnValueOnce("");

      await expect(service.registerTags(new Map([["sunday", "Sunday"]]))).resolves.toBeUndefined();
      expect(hashtagModel.bulkWrite).not.toHaveBeenCalled();
    });
  });

  describe("deleteBySlug", () => {
    it("normalizes the slug before deleting", async () => {
      await service.deleteBySlug("#Sunday");

      expect(hashtagModel.deleteOne).toHaveBeenCalledWith({ slug: "sunday" });
    });

    // A slug that cannot normalize can never match a stored one, so there is
    // nothing to ask the database.
    it("throws NotFoundException for an unusable slug, without querying", async () => {
      await expect(service.deleteBySlug("###")).rejects.toBeInstanceOf(NotFoundException);

      expect(hashtagModel.deleteOne).not.toHaveBeenCalled();
    });

    // deleteOne reports success whether or not it matched, so without this
    // check DELETE /hashtags/anything returned 200 and the caller could not
    // tell a real delete from a no-op.
    it("throws NotFoundException when no tag matched", async () => {
      hashtagModel.deleteOne.mockReturnValue(queryOf({ deletedCount: 0 }));

      await expect(service.deleteBySlug("sunday")).rejects.toBeInstanceOf(NotFoundException);
    });

    it("resolves when a tag was deleted", async () => {
      await expect(service.deleteBySlug("sunday")).resolves.toBeUndefined();
    });
  });
});
