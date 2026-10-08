import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { getModelToken } from "@nestjs/mongoose";
import { Test, TestingModule } from "@nestjs/testing";
import { getUtcNow } from "@northguild/gmt";
import mongoose from "mongoose";

import type { AuthUser } from "../auth/auth-user.js";
import { HashtagsService } from "../hashtags/hashtags.service.js";
import { UserRole } from "../users/user.entity.js";
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
    // Only reached when an ownership-scoped write matched nothing, to tell a
    // missing abiding from someone else's.
    exists: vi.fn(),
  };

  // Who is asking. The writes take a caller now, so these stand in for the
  // user JwtAuthGuard puts on the request.
  const author: AuthUser = { userId: 1, username: "walter", role: UserRole.USER };
  const other: AuthUser = { userId: 2, username: "donny", role: UserRole.USER };
  const admin: AuthUser = { userId: 9, username: "maude", role: UserRole.ADMIN };

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
    // Default: the abiding exists, so a write that matched nothing reads as an
    // ownership refusal. Tests for a missing abiding override this with null.
    abidingModel.exists.mockReturnValue(queryOf({ _id: "x" }));

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

      const result = await service.createAbiding({ message: "new abiding" }, author);

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

      await service.createAbiding({ message: "Taking it easy #Sunday" }, author);

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

      await service.createAbiding({ message: "Taking it easy #Sunday" }, author);

      expect(hashtagsService.registerTags).toHaveBeenCalledWith(new Map([["sunday", "Sunday"]]));
    });

    // The author used to come from the request body, so anyone could post as
    // anyone. It now comes from the verified token and nowhere else.
    it("writes the caller as the author", async () => {
      abidingModel.create.mockResolvedValue({ _id: new mongoose.Types.ObjectId(), userId: 2 });

      await service.createAbiding({ message: "mine" }, other);

      expect(abidingModel.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 2 }));
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

      const result = await service.patchAbiding(
        mockAbiding._id.toString(),
        { message: "updated" },
        author,
      );

      expect(result.message).toBe("updated");
    });

    it("throws NotFoundException when abiding not found", async () => {
      abidingModel.findOneAndUpdate.mockReturnValue(queryOf(null));
      abidingModel.exists.mockReturnValue(queryOf(null));

      await expect(
        service.patchAbiding("nonexistent", { message: "updated" }, author),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("re-derives hashtags when the message changes", async () => {
      abidingModel.findOneAndUpdate.mockReturnValue(queryOf({ _id: "x", message: "#Dude" }));

      await service.patchAbiding("x", { message: "New #Dude message" }, author);

      // returnDocument here is the new name for the old "new" option, which was deprecated in Mongoose 7.
      // it tells findOneAndUpdate to return the updated document, not the original.
      expect(abidingModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: "x", deletedAt: null, userId: 1 },
        expect.objectContaining({ message: "New #Dude message", hashtags: ["dude"] }),
        { returnDocument: "after" },
      );
    });

    it("registers tags an edit introduces", async () => {
      abidingModel.findOneAndUpdate.mockReturnValue(queryOf({ _id: "x", message: "#Walter" }));

      await service.patchAbiding("x", { message: "Now about #Walter" }, author);

      expect(hashtagsService.registerTags).toHaveBeenCalledWith(new Map([["walter", "Walter"]]));
    });

    it("doesn't touch the registry when the message doesn't change", async () => {
      abidingModel.findOneAndUpdate.mockReturnValue(queryOf({ _id: "x", imageUrl: "a" }));

      await service.patchAbiding("x", { imageUrl: "https://example.com/a.png" }, author);

      expect(hashtagsService.registerTags).not.toHaveBeenCalled();
    });

    it("leaves hashtags untouched when the message doesn't change", async () => {
      abidingModel.findOneAndUpdate.mockReturnValue(queryOf({ _id: "x", imageUrl: "a" }));

      await service.patchAbiding("x", { imageUrl: "https://example.com/a.png" }, author);

      expect(abidingModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: "x", deletedAt: null, userId: 1 },
        expect.not.objectContaining({ hashtags: expect.anything() }),
        { returnDocument: "after" },
      );
    });

    // The authorization rule lives in the filter, not a separate read, so
    // these assert the filter rather than a thrown error.
    it("scopes the write to the caller's own abidings", async () => {
      abidingModel.findOneAndUpdate.mockReturnValue(queryOf({ _id: "x", message: "m" }));

      await service.patchAbiding("x", { message: "m" }, other);

      expect(abidingModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: "x", deletedAt: null, userId: 2 },
        expect.anything(),
        { returnDocument: "after" },
      );
    });

    it("lets an admin edit an abiding they did not write", async () => {
      abidingModel.findOneAndUpdate.mockReturnValue(queryOf({ _id: "x", message: "m" }));

      await service.patchAbiding("x", { message: "m" }, admin);

      expect(abidingModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: "x", deletedAt: null },
        expect.anything(),
        { returnDocument: "after" },
      );
    });

    it("throws ForbiddenException when the abiding exists but belongs to someone else", async () => {
      abidingModel.findOneAndUpdate.mockReturnValue(queryOf(null));
      abidingModel.exists.mockReturnValue(queryOf({ _id: "x" }));

      await expect(service.patchAbiding("x", { message: "m" }, other)).rejects.toBeInstanceOf(
        ForbiddenException,
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

      await service.deleteAbiding(mockAbiding._id.toString(), author);

      expect(abidingModel.findOneAndDelete).toHaveBeenCalledWith({
        _id: mockAbiding._id.toString(),
        deletedAt: null,
        userId: 1,
      });
    });

    it("throws NotFoundException when abiding not found", async () => {
      abidingModel.findOneAndDelete.mockReturnValue(queryOf(null));
      abidingModel.exists.mockReturnValue(queryOf(null));

      await expect(service.deleteAbiding("nonexistent", author)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("lets an admin delete an abiding they did not write", async () => {
      abidingModel.findOneAndDelete.mockReturnValue(queryOf({ _id: "x" }));

      await service.deleteAbiding("x", admin);

      expect(abidingModel.findOneAndDelete).toHaveBeenCalledWith({
        _id: "x",
        deletedAt: null,
      });
    });

    it("throws ForbiddenException when the abiding exists but belongs to someone else", async () => {
      abidingModel.findOneAndDelete.mockReturnValue(queryOf(null));
      abidingModel.exists.mockReturnValue(queryOf({ _id: "x" }));

      await expect(service.deleteAbiding("x", other)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
