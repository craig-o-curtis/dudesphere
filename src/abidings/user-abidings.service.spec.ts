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
  });

  describe("restoreForUser", () => {
    it("clears deletedAt on the user's soft-deleted abidings", async () => {
      await service.restoreForUser(3);

      expect(abidingModel.updateMany).toHaveBeenCalledWith(
        { userId: 3, deletedAt: { $ne: null } },
        { $set: { deletedAt: null } },
      );
    });
  });
});
