import { NotFoundException } from "@nestjs/common";
import { getModelToken } from "@nestjs/mongoose";
import { Test, TestingModule } from "@nestjs/testing";
import { getUtcNow } from "@northguild/gmt";
import mongoose from "mongoose";

import type { AuthUser } from "../auth/auth-user.js";
import { HashtagsService } from "../hashtags/hashtags.service.js";
import { NotOwnerException } from "../shared/exceptions/not-owner.exception.js";
import { UserRole } from "../users/user.entity.js";
import { Abiding } from "./abiding.schema.js";
import { AbidingsService } from "./abidings.service.js";
import { AbidingResponseDto } from "./dto/abiding-response.dto.js";

describe("AbidingsService", () => {
  let service: AbidingsService;

  // Mongoose query methods return a Query, and the service calls .exec() on it.
  // create() is the exception: it returns a promise directly.
  function queryOf<T>(value: T) {
    return { exec: vi.fn().mockResolvedValue(value) };
  }

  // A list query is a chain: find().sort().skip().limit().exec(). Each step
  // returns the same query, so a test can ask what any of them was called with.
  function listQueryOf<T>(value: T) {
    const query = {
      sort: vi.fn(),
      skip: vi.fn(),
      limit: vi.fn(),
      exec: vi.fn().mockResolvedValue(value),
    };
    query.sort.mockReturnValue(query);
    query.skip.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    return query;
  }

  const firstPage = { limit: 10, page: 1 };

  const abidingModel = {
    find: vi.fn(),
    countDocuments: vi.fn(),
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
    abidingModel.find.mockReturnValue(listQueryOf([]));
    abidingModel.countDocuments.mockReturnValue(queryOf(0));
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

  // Every list method ends in the same private findPage, so the sort, the
  // limit and the count are checked once here, through getAbidings.
  describe("paging a list", () => {
    it("sorts newest first, with _id to break ties on createdAt", async () => {
      const query = listQueryOf([]);
      abidingModel.find.mockReturnValue(query);

      await service.getAbidings(firstPage);

      expect(query.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
    });

    it("reads one page: skips the earlier pages and stops at the limit", async () => {
      const query = listQueryOf([]);
      abidingModel.find.mockReturnValue(query);

      await service.getAbidings({ limit: 5, page: 3 });

      expect(query.skip).toHaveBeenCalledWith(10);
      expect(query.limit).toHaveBeenCalledWith(5);
    });

    // The count has to use the filter the page used, or the total would
    // describe a different list from the one the caller is paging through.
    it("counts with the same filter it reads with", async () => {
      await service.getAbidings(firstPage, 3);

      expect(abidingModel.find).toHaveBeenCalledWith({ deletedAt: null, userId: 3 });
      expect(abidingModel.countDocuments).toHaveBeenCalledWith({ deletedAt: null, userId: 3 });
    });

    it("returns the page's abidings and the count of all of them", async () => {
      const utcNow = getUtcNow();
      const mockAbiding = {
        _id: new mongoose.Types.ObjectId(),
        userId: 1,
        message: "hello",
        createdAt: utcNow,
        updatedAt: utcNow,
      };
      abidingModel.find.mockReturnValue(listQueryOf([mockAbiding]));
      abidingModel.countDocuments.mockReturnValue(queryOf(41));

      const result = await service.getAbidings(firstPage);

      expect(result.items.map((abiding) => abiding.id)).toEqual([mockAbiding._id.toString()]);
      expect(result.total).toBe(41);
    });

    // toPaginatedResponse passes items through, and the serializer applies
    // the DTO's @Transform rules by looking at each item's class. An object
    // literal has none.
    it("returns real AbidingResponseDto instances", async () => {
      abidingModel.find.mockReturnValue(
        listQueryOf([{ _id: new mongoose.Types.ObjectId(), userId: 1, message: "hello" }]),
      );

      const result = await service.getAbidings(firstPage);

      expect(result.items[0]).toBeInstanceOf(AbidingResponseDto);
    });
  });

  describe("getAbidings", () => {
    it("reads every abiding that is not deleted when given no user", async () => {
      await service.getAbidings(firstPage);

      expect(abidingModel.find).toHaveBeenCalledWith({ deletedAt: null });
    });
  });

  describe("getAbidingsByUserId", () => {
    // deletedAt: null hides abidings of a soft-deleted user, same as
    // getAbidings does when it's given a userId.
    it("scopes the query to the user's abidings that are not deleted", async () => {
      await service.getAbidingsByUserId(3, firstPage);

      expect(abidingModel.find).toHaveBeenCalledWith({ userId: 3, deletedAt: null });
      expect(abidingModel.countDocuments).toHaveBeenCalledWith({ userId: 3, deletedAt: null });
    });
  });

  describe("getAbidingsByHashtag", () => {
    it("normalizes the tag before querying", async () => {
      await service.getAbidingsByHashtag("SUNDAY", firstPage);

      expect(abidingModel.find).toHaveBeenCalledWith({ deletedAt: null, hashtags: "sunday" });
    });

    it("narrows to a user when given one", async () => {
      await service.getAbidingsByHashtag("sunday", firstPage, 3);

      expect(abidingModel.find).toHaveBeenCalledWith({
        deletedAt: null,
        hashtags: "sunday",
        userId: 3,
      });
    });

    it("returns an empty page for a tag that can't normalize, without querying", async () => {
      const result = await service.getAbidingsByHashtag("###", firstPage);

      expect(result).toEqual({ items: [], total: 0 });
      expect(abidingModel.find).not.toHaveBeenCalled();
      expect(abidingModel.countDocuments).not.toHaveBeenCalled();
    });
  });

  describe("getAbidingsByHashtags", () => {
    it("normalizes, dedupes and queries with $in for OR matching", async () => {
      await service.getAbidingsByHashtags(["Sunday", "sunday", "Dude"], firstPage);

      expect(abidingModel.find).toHaveBeenCalledWith({
        deletedAt: null,
        hashtags: { $in: ["sunday", "dude"] },
      });
    });

    it("narrows to a user when given one", async () => {
      await service.getAbidingsByHashtags(["sunday"], firstPage, 3);

      expect(abidingModel.find).toHaveBeenCalledWith({
        deletedAt: null,
        hashtags: { $in: ["sunday"] },
        userId: 3,
      });
    });

    it("returns an empty page when no tag can normalize, without querying", async () => {
      const result = await service.getAbidingsByHashtags(["###", ""], firstPage);

      expect(result).toEqual({ items: [], total: 0 });
      expect(abidingModel.find).not.toHaveBeenCalled();
      expect(abidingModel.countDocuments).not.toHaveBeenCalled();
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
        imageUrl: null,
        replyToId: null,
        hashtags: [],
      });
      expect(result.message).toBe("new abiding");
    });

    // The DTO always accepted imageUrl, and this method used to drop it: a
    // post with an image was stored without one and returned without one.
    it("stores the image url and returns it", async () => {
      abidingModel.create.mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        userId: 1,
        message: "with a picture",
        imageUrl: "https://example.com/rug.png",
      });

      const result = await service.createAbiding(
        { message: "with a picture", imageUrl: "https://example.com/rug.png" },
        author,
      );

      expect(abidingModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ imageUrl: "https://example.com/rug.png" }),
      );
      expect(result.imageUrl).toBe("https://example.com/rug.png");
    });

    // Mongo has no foreign keys, so the service is the only thing that can
    // stop a reply to an abiding that is not there.
    describe("a reply", () => {
      const PARENT_ID = "65f000000000000000000001";

      it("is written when the abiding it replies to exists", async () => {
        abidingModel.create.mockResolvedValue({ _id: new mongoose.Types.ObjectId(), userId: 1 });

        await service.createAbiding({ message: "yeah, well", replyToId: PARENT_ID }, author);

        expect(abidingModel.exists).toHaveBeenCalledWith({ _id: PARENT_ID, deletedAt: null });
        expect(abidingModel.create).toHaveBeenCalledWith(
          expect.objectContaining({ replyToId: PARENT_ID }),
        );
      });

      it("is refused with a 404, and nothing is written, when that abiding is missing", async () => {
        abidingModel.exists.mockReturnValue(queryOf(null));

        await expect(
          service.createAbiding({ message: "yeah, well", replyToId: PARENT_ID }, author),
        ).rejects.toThrow("The abiding being replied to was not found");

        expect(abidingModel.create).not.toHaveBeenCalled();
      });

      it("skips the lookup when the abiding is not a reply", async () => {
        abidingModel.create.mockResolvedValue({ _id: new mongoose.Types.ObjectId(), userId: 1 });

        await service.createAbiding({ message: "not a reply" }, author);

        expect(abidingModel.exists).not.toHaveBeenCalled();
      });
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
        { returnDocument: "after", runValidators: true },
      );
    });

    it("registers tags an edit introduces", async () => {
      abidingModel.findOneAndUpdate.mockReturnValue(queryOf({ _id: "x", message: "#Walter" }));

      await service.patchAbiding("x", { message: "Now about #Walter" }, author);

      expect(hashtagsService.registerTags).toHaveBeenCalledWith(new Map([["walter", "Walter"]]));
    });

    // A missing field and a null mean different things. Missing leaves the
    // stored value alone. Null clears it, and it used to be dropped: a reply
    // could never be turned back into a plain abiding.
    describe("replyToId and imageUrl", () => {
      const PARENT_ID = "65f000000000000000000001";
      function writtenUpdate() {
        return abidingModel.findOneAndUpdate.mock.calls[0][1] as Record<string, unknown>;
      }

      beforeEach(() => {
        abidingModel.findOneAndUpdate.mockReturnValue(queryOf({ _id: "x", message: "m" }));
      });

      it("writes null for each, which clears it", async () => {
        await service.patchAbiding("x", { replyToId: null, imageUrl: null }, author);

        expect(writtenUpdate()).toMatchObject({ replyToId: null, imageUrl: null });
      });

      it("leaves each undefined when the body does not mention it", async () => {
        await service.patchAbiding("x", { message: "only the message" }, author);

        expect(writtenUpdate().replyToId).toBeUndefined();
        expect(writtenUpdate().imageUrl).toBeUndefined();
      });

      it("writes a new replyToId when the abiding it names exists", async () => {
        await service.patchAbiding("x", { replyToId: PARENT_ID }, author);

        expect(abidingModel.exists).toHaveBeenCalledWith({ _id: PARENT_ID, deletedAt: null });
        expect(writtenUpdate()).toMatchObject({ replyToId: PARENT_ID });
      });

      it("refuses a replyToId that names a missing abiding, and writes nothing", async () => {
        abidingModel.exists.mockReturnValue(queryOf(null));

        await expect(service.patchAbiding("x", { replyToId: PARENT_ID }, author)).rejects.toThrow(
          "The abiding being replied to was not found",
        );

        expect(abidingModel.findOneAndUpdate).not.toHaveBeenCalled();
      });

      it("refuses an abiding that replies to itself, and writes nothing", async () => {
        await expect(
          service.patchAbiding(PARENT_ID, { replyToId: PARENT_ID }, author),
        ).rejects.toThrow("An abiding cannot reply to itself");

        expect(abidingModel.findOneAndUpdate).not.toHaveBeenCalled();
      });
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
        { returnDocument: "after", runValidators: true },
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
        { returnDocument: "after", runValidators: true },
      );
    });

    it("lets an admin edit an abiding they did not write", async () => {
      abidingModel.findOneAndUpdate.mockReturnValue(queryOf({ _id: "x", message: "m" }));

      await service.patchAbiding("x", { message: "m" }, admin);

      expect(abidingModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: "x", deletedAt: null },
        expect.anything(),
        { returnDocument: "after", runValidators: true },
      );
    });

    it("throws NotOwnerException when the abiding exists but belongs to someone else", async () => {
      abidingModel.findOneAndUpdate.mockReturnValue(queryOf(null));
      abidingModel.exists.mockReturnValue(queryOf({ _id: "x" }));

      const attempt = service.patchAbiding("x", { message: "m" }, other);

      await expect(attempt).rejects.toBeInstanceOf(NotOwnerException);
      await expect(attempt).rejects.toMatchObject({ errorCode: "NOT_OWNER" });
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

    it("throws NotOwnerException when the abiding exists but belongs to someone else", async () => {
      abidingModel.findOneAndDelete.mockReturnValue(queryOf(null));
      abidingModel.exists.mockReturnValue(queryOf({ _id: "x" }));

      const attempt = service.deleteAbiding("x", other);

      await expect(attempt).rejects.toBeInstanceOf(NotOwnerException);
      await expect(attempt).rejects.toMatchObject({ errorCode: "NOT_OWNER" });
    });
  });
});
