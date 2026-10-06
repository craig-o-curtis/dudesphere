import { NotFoundException } from "@nestjs/common";
import { getModelToken } from "@nestjs/mongoose";
import { Test, TestingModule } from "@nestjs/testing";
import { getUtcNow } from "@northguild/gmt";
import mongoose from "mongoose";

import { HashtagsService } from "../hashtags/hashtags.service.js";
import { Abiding } from "./abiding.schema.js";
import { AbidingsService } from "./abidings.service.js";

describe("AbidingsService", () => {
  let service: AbidingsService;

  // Mongoose query methods return a Query, and the service calls .exec() on it.
  // create() is the exception: it returns a promise directly.
  const queryOf = <T>(value: T) => ({ exec: vi.fn().mockResolvedValue(value) });

  const abidingModel = {
    find: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
    findOneAndUpdate: vi.fn(),
    findOneAndDelete: vi.fn(),
  };

  // The registry write is a side effect of posting, not part of the abiding
  // write — see HashtagsService.registerTags.
  const hashtagsService = {
    registerTags: vi.fn(),
  };

  beforeEach(async () => {
    // resetAllMocks, not clearAllMocks: clearAllMocks keeps implementations, so
    // a mockResolvedValue set in one test leaks into the next.
    vi.resetAllMocks();
    abidingModel.find.mockReturnValue(queryOf([]));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AbidingsService,
        { provide: getModelToken(Abiding.name), useValue: abidingModel },
        { provide: HashtagsService, useValue: hashtagsService },
      ],
    }).compile();

    service = module.get<AbidingsService>(AbidingsService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("getAbidingById", () => {
    it("returns the abiding when found", async () => {
      const utcNow = getUtcNow();
      const mockAbiding = {
        _id: new mongoose.Types.ObjectId(),
        userId: 1,
        message: "hello",
        createdAt: utcNow,
        updatedAt: utcNow,
      };
      abidingModel.findOne.mockReturnValue(queryOf(mockAbiding));

      const result = await service.getAbidingById(mockAbiding._id.toString());

      expect(abidingModel.findOne).toHaveBeenCalledWith({
        _id: mockAbiding._id.toString(),
        deletedAt: null,
      });
      expect(result.id).toBe(mockAbiding._id.toString());
    });

    it("throws NotFoundException when abiding not found", async () => {
      abidingModel.findOne.mockReturnValue(queryOf(null));

      await expect(service.getAbidingById("nonexistent")).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("getAbidingsByUserId", () => {
    // deletedAt: null hides abidings of a soft-deleted user, same as
    // getAbidings does when it's given a userId.
    it("scopes the query to the user's abidings that are not deleted", async () => {
      await service.getAbidingsByUserId(3);

      expect(abidingModel.find).toHaveBeenCalledWith({ userId: 3, deletedAt: null });
    });
  });

  describe("getAbidingsByHashtag", () => {
    it("normalizes the tag before querying", async () => {
      await service.getAbidingsByHashtag("SUNDAY");

      expect(abidingModel.find).toHaveBeenCalledWith({ deletedAt: null, hashtags: "sunday" });
    });

    it("narrows to a user when given one", async () => {
      await service.getAbidingsByHashtag("sunday", 3);

      expect(abidingModel.find).toHaveBeenCalledWith({
        deletedAt: null,
        hashtags: "sunday",
        userId: 3,
      });
    });

    it("returns an empty array for a tag that can't normalize, without querying", async () => {
      const result = await service.getAbidingsByHashtag("###");

      expect(result).toEqual([]);
      expect(abidingModel.find).not.toHaveBeenCalled();
    });
  });

  describe("getAbidingsByHashtags", () => {
    it("normalizes, dedupes and queries with $in for OR matching", async () => {
      await service.getAbidingsByHashtags(["Sunday", "sunday", "Dude"]);

      expect(abidingModel.find).toHaveBeenCalledWith({
        deletedAt: null,
        hashtags: { $in: ["sunday", "dude"] },
      });
    });

    it("narrows to a user when given one", async () => {
      await service.getAbidingsByHashtags(["sunday"], 3);

      expect(abidingModel.find).toHaveBeenCalledWith({
        deletedAt: null,
        hashtags: { $in: ["sunday"] },
        userId: 3,
      });
    });

    it("returns an empty array when no tag can normalize, without querying", async () => {
      const result = await service.getAbidingsByHashtags(["###", ""]);

      expect(result).toEqual([]);
      expect(abidingModel.find).not.toHaveBeenCalled();
    });
  });

  describe("createAbiding", () => {
    it("creates and returns the abiding", async () => {
      const utcNow = getUtcNow();
      const mockAbiding = {
        _id: new mongoose.Types.ObjectId(),
        userId: 1,
        message: "new abiding",
        createdAt: utcNow,
        updatedAt: utcNow,
      };
      abidingModel.create.mockResolvedValue(mockAbiding);

      const result = await service.createAbiding({ userId: "1", message: "new abiding" });

      expect(abidingModel.create).toHaveBeenCalledWith({
        userId: 1,
        message: "new abiding",
        replyToId: null,
        hashtags: [],
      });
      expect(result.message).toBe("new abiding");
    });

    it("derives hashtags from the message", async () => {
      const mockAbiding = { _id: new mongoose.Types.ObjectId(), userId: 1, message: "#Sunday" };
      abidingModel.create.mockResolvedValue(mockAbiding);

      await service.createAbiding({ userId: "1", message: "Taking it easy #Sunday" });

      expect(abidingModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ hashtags: ["sunday"] }),
      );
    });

    // The registry is what GET /hashtags lists. Without this the tag would
    // only exist inside the abiding, and a dropdown couldn't find it.
    it("registers the tags, keeping the casing they were written with", async () => {
      abidingModel.create.mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        userId: 1,
        message: "#Sunday",
      });

      await service.createAbiding({ userId: "1", message: "Taking it easy #Sunday" });

      expect(hashtagsService.registerTags).toHaveBeenCalledWith(new Map([["sunday", "Sunday"]]));
    });
  });

  describe("patchAbiding", () => {
    it("returns the updated abiding when found", async () => {
      const utcNow = getUtcNow();
      const mockAbiding = {
        _id: new mongoose.Types.ObjectId(),
        userId: 1,
        message: "updated",
        createdAt: utcNow,
        updatedAt: utcNow,
      };
      abidingModel.findOneAndUpdate.mockReturnValue(queryOf(mockAbiding));

      const result = await service.patchAbiding(mockAbiding._id.toString(), { message: "updated" });

      expect(result.message).toBe("updated");
    });

    it("throws NotFoundException when abiding not found", async () => {
      abidingModel.findOneAndUpdate.mockReturnValue(queryOf(null));

      await expect(
        service.patchAbiding("nonexistent", { message: "updated" }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("re-derives hashtags when the message changes", async () => {
      abidingModel.findOneAndUpdate.mockReturnValue(queryOf({ _id: "x", message: "#Dude" }));

      await service.patchAbiding("x", { message: "New #Dude message" });

      expect(abidingModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: "x", deletedAt: null },
        expect.objectContaining({ message: "New #Dude message", hashtags: ["dude"] }),
        { new: true },
      );
    });

    it("registers tags an edit introduces", async () => {
      abidingModel.findOneAndUpdate.mockReturnValue(queryOf({ _id: "x", message: "#Walter" }));

      await service.patchAbiding("x", { message: "Now about #Walter" });

      expect(hashtagsService.registerTags).toHaveBeenCalledWith(new Map([["walter", "Walter"]]));
    });

    it("doesn't touch the registry when the message doesn't change", async () => {
      abidingModel.findOneAndUpdate.mockReturnValue(queryOf({ _id: "x", imageUrl: "a" }));

      await service.patchAbiding("x", { imageUrl: "https://example.com/a.png" });

      expect(hashtagsService.registerTags).not.toHaveBeenCalled();
    });

    it("leaves hashtags untouched when the message doesn't change", async () => {
      abidingModel.findOneAndUpdate.mockReturnValue(queryOf({ _id: "x", imageUrl: "a" }));

      await service.patchAbiding("x", { imageUrl: "https://example.com/a.png" });

      expect(abidingModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: "x", deletedAt: null },
        expect.not.objectContaining({ hashtags: expect.anything() }),
        { new: true },
      );
    });
  });

  describe("deleteAbiding", () => {
    it("deletes the abiding when found", async () => {
      const utcNow = getUtcNow();
      const mockAbiding = {
        _id: new mongoose.Types.ObjectId(),
        userId: 1,
        message: "deleted",
        createdAt: utcNow,
        updatedAt: utcNow,
      };
      abidingModel.findOneAndDelete.mockReturnValue(queryOf(mockAbiding));

      await service.deleteAbiding(mockAbiding._id.toString());

      expect(abidingModel.findOneAndDelete).toHaveBeenCalledWith({
        _id: mockAbiding._id.toString(),
        deletedAt: null,
      });
    });

    it("throws NotFoundException when abiding not found", async () => {
      abidingModel.findOneAndDelete.mockReturnValue(queryOf(null));

      await expect(service.deleteAbiding("nonexistent")).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
