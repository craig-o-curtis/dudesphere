import { NotFoundException } from "@nestjs/common";
import { getModelToken } from "@nestjs/mongoose";
import { Test, TestingModule } from "@nestjs/testing";
import { getUtcNow } from "@northguild/gmt";
import mongoose from "mongoose";

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

  beforeEach(async () => {
    // resetAllMocks, not clearAllMocks: clearAllMocks keeps implementations, so
    // a mockResolvedValue set in one test leaks into the next.
    vi.resetAllMocks();
    abidingModel.find.mockReturnValue(queryOf([]));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AbidingsService,
        { provide: getModelToken(Abiding.name), useValue: abidingModel },
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
      });
      expect(result.message).toBe("new abiding");
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
