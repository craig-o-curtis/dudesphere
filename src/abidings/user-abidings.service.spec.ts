import { ServiceUnavailableException } from "@nestjs/common";
import { getModelToken } from "@nestjs/mongoose";
import { Test } from "@nestjs/testing";

import { Abiding } from "./abiding.schema.js";
import { UserAbidingsService } from "./user-abidings.service.js";

describe("UserAbidingsService", () => {
  let service: UserAbidingsService;

  const abidingModel = {
    updateMany: vi.fn(() => ({ exec: vi.fn().mockResolvedValue({ modifiedCount: 2 }) })),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        UserAbidingsService,
        { provide: getModelToken(Abiding.name), useValue: abidingModel },
      ],
    }).compile();

    service = module.get(UserAbidingsService);
  });

  describe("softDeleteForUser", () => {
    // deletedAt: null leaves abidings that are already deleted alone,
    // so they keep their first timestamp.
    it("stamps deletedAt on the user's abidings that are not deleted yet", async () => {
      await service.softDeleteForUser(3);

      expect(abidingModel.updateMany).toHaveBeenCalledWith(
        { userId: 3, deletedAt: null },
        { $set: { deletedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/) } },
      );
    });

    it("wraps a Mongo failure in a 503 that carries the original error as cause", async () => {
      const driverError = new Error("socket closed");
      abidingModel.updateMany.mockReturnValueOnce({ exec: vi.fn().mockRejectedValue(driverError) });

      const failure = await service.softDeleteForUser(3).catch((e: unknown) => e);

      expect(failure).toBeInstanceOf(ServiceUnavailableException);
      expect((failure as ServiceUnavailableException).errorCode).toBe("DATABASE_UNAVAILABLE");
      expect((failure as ServiceUnavailableException).cause).toBe(driverError);
    });
  });

  describe("restoreForUser", () => {
    it("clears deletedAt on the user's soft-deleted abidings", async () => {
      await service.restoreForUser(3);

      expect(abidingModel.updateMany).toHaveBeenCalledWith(
        { userId: 3, deletedAt: { $ne: null } },
        { $set: { deletedAt: null } },
      );
    });

    it("wraps a Mongo failure in a 503 that carries the original error as cause", async () => {
      const driverError = new Error("socket closed");
      abidingModel.updateMany.mockReturnValueOnce({ exec: vi.fn().mockRejectedValue(driverError) });

      const failure = await service.restoreForUser(3).catch((e: unknown) => e);

      expect(failure).toBeInstanceOf(ServiceUnavailableException);
      expect((failure as ServiceUnavailableException).errorCode).toBe("DATABASE_UNAVAILABLE");
      expect((failure as ServiceUnavailableException).cause).toBe(driverError);
    });
  });
});
