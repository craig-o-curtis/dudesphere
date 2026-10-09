import { NotFoundException, ServiceUnavailableException } from "@nestjs/common";
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
    updateOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    hashtagModel.find.mockReturnValue(queryOf([]));
    hashtagModel.findOne.mockReturnValue(queryOf(null));
    // Default: the delete found a live tag to stamp.
    hashtagModel.updateOne.mockReturnValue(queryOf({ matchedCount: 1 }));
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

    // The filter is what hides a deleted tag from the dropdown. Mongo matches
    // `deletedAt: null` against a missing field too, so rows written before
    // the field existed still count as live.
    it("leaves out tags an admin has deleted", async () => {
      await service.listAll();

      expect(hashtagModel.find).toHaveBeenCalledWith({ deletedAt: null });
    });
  });

  describe("getBySlug", () => {
    // deletedAt: null means a deleted tag reads as not found, the same as one
    // that never existed.
    it("normalizes before looking up, and only finds a live tag", async () => {
      await service.getBySlug("#Sunday");

      expect(hashtagModel.findOne).toHaveBeenCalledWith({ slug: "sunday", deletedAt: null });
    });

    it("returns null for a slug that can't normalize, without querying", async () => {
      const result = await service.getBySlug("###");

      expect(result).toBeNull();
      expect(hashtagModel.findOne).not.toHaveBeenCalled();
    });

    it("returns null when the tag isn't registered", async () => {
      hashtagModel.findOne.mockReturnValue(queryOf(null));

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

    // A deleted tag keeps its row, with deletedAt set. The upsert matches that
    // row and $setOnInsert writes nothing to a row that exists, so posting
    // with the tag does not put it back on the list. The backfill relies on
    // the same thing: it re-registers every tag every abiding carries, and
    // abidings keep a tag after it is deleted.
    it("never touches deletedAt, so a deleted tag stays deleted", async () => {
      await service.registerTags(new Map([["sunday", "Sunday"]]));

      const { update } = hashtagModel.bulkWrite.mock.calls[0][0][0].updateOne;
      expect(Object.keys(update)).toEqual(["$setOnInsert"]);
      expect(update.$setOnInsert).not.toHaveProperty("deletedAt");
    });

    // The other half of the same guarantee. Narrowing the filter to live tags
    // would make the upsert try to insert a second row for a deleted slug,
    // and the unique index would reject it on every reuse.
    it("matches on slug alone, so a deleted row is matched rather than duplicated", async () => {
      await service.registerTags(new Map([["sunday", "Sunday"]]));

      const { filter } = hashtagModel.bulkWrite.mock.calls[0][0][0].updateOne;
      expect(filter).toEqual({ slug: "sunday" });
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
    // A soft delete: the row stays. That row is what stops registerTags from
    // adding the tag again the next time an abiding uses it.
    it("stamps deletedAt with the UTC string getUtcNow returned", async () => {
      await service.deleteBySlug("sunday");

      const [, update] = hashtagModel.updateOne.mock.calls[0];
      // Written through unchanged, the same as firstUsedAt.
      expect(update).toEqual({ $set: { deletedAt: UTC_NOW } });
    });

    // deletedAt: null in the filter keeps the first timestamp on a tag that
    // is already deleted, and is what makes a second delete a 404.
    it("normalizes the slug, and only touches a tag that is still live", async () => {
      await service.deleteBySlug("#Sunday");

      const [filter] = hashtagModel.updateOne.mock.calls[0];
      expect(filter).toEqual({ slug: "sunday", deletedAt: null });
    });

    // A slug that cannot normalize can never match a stored one, so there is
    // nothing to ask the database.
    it("throws NotFoundException for an unusable slug, without querying", async () => {
      await expect(service.deleteBySlug("###")).rejects.toBeInstanceOf(NotFoundException);

      expect(hashtagModel.updateOne).not.toHaveBeenCalled();
    });

    // Covers both a tag that never existed and one that is already deleted.
    // Without this check DELETE /hashtags/anything returned 200 and the
    // caller could not tell a real delete from a no-op.
    it("throws NotFoundException when no live tag matched", async () => {
      hashtagModel.updateOne.mockReturnValue(queryOf({ matchedCount: 0 }));

      await expect(service.deleteBySlug("sunday")).rejects.toBeInstanceOf(NotFoundException);
    });

    // Thrown, not swallowed as registerTags does. The caller asked for this
    // delete, so they have to hear that it did not happen. Writing anyway
    // would hide the tag behind a blank timestamp.
    it("throws ServiceUnavailableException when the clock can't be read, and writes nothing", async () => {
      vi.mocked(getUtcNow).mockReturnValueOnce("");

      const attempt = service.deleteBySlug("sunday");

      await expect(attempt).rejects.toBeInstanceOf(ServiceUnavailableException);
      await expect(attempt).rejects.toMatchObject({ errorCode: "CLOCK_UNAVAILABLE" });
      expect(hashtagModel.updateOne).not.toHaveBeenCalled();
    });

    it("resolves when a tag was deleted", async () => {
      await expect(service.deleteBySlug("sunday")).resolves.toBeUndefined();
    });
  });

  describe("restoreBySlug", () => {
    const restoredRow = {
      slug: "sunday",
      display: "Sunday",
      firstUsedAt: "2026-10-05T00:00:00.000Z",
      deletedAt: null,
    };

    // The row was kept through the delete, so the tag comes back as it was:
    // the first casing and the first date, not new ones.
    it("returns the restored tag with its first casing and date", async () => {
      hashtagModel.findOneAndUpdate.mockReturnValue(queryOf(restoredRow));

      const result = await service.restoreBySlug("sunday");

      expect(result).toEqual({
        slug: "sunday",
        display: "Sunday",
        firstUsedAt: "2026-10-05T00:00:00.000Z",
      });
    });

    // $ne: null is what limits this to a deleted tag. returnDocument: "after"
    // makes the one call both the restore and the read of the restored row.
    it("clears deletedAt on a deleted tag, after normalizing the slug", async () => {
      hashtagModel.findOneAndUpdate.mockReturnValue(queryOf(restoredRow));

      await service.restoreBySlug("#Sunday");

      expect(hashtagModel.findOneAndUpdate).toHaveBeenCalledWith(
        { slug: "sunday", deletedAt: { $ne: null } },
        { $set: { deletedAt: null } },
        { returnDocument: "after" },
      );
    });

    it("throws NotFoundException for an unusable slug, without querying", async () => {
      await expect(service.restoreBySlug("###")).rejects.toBeInstanceOf(NotFoundException);

      expect(hashtagModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    // Covers a tag that is live and one that never existed. Both are a 404,
    // the same as UsersService.restoreUser on a user who is not deleted.
    it("throws NotFoundException when no deleted tag matched", async () => {
      hashtagModel.findOneAndUpdate.mockReturnValue(queryOf(null));

      await expect(service.restoreBySlug("sunday")).rejects.toThrow("Deleted hashtag not found");
    });
  });
});
