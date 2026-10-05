import { getModelToken } from "@nestjs/mongoose";
import { Test, TestingModule } from "@nestjs/testing";

import { Abiding } from "./abiding.schema.js";
import { AbidingService } from "./abiding.service.js";

describe("AbidingService", () => {
  let service: AbidingService;

  // find().exec() is the only model call getAbidingsByUserId makes.
  const abidingModel = {
    find: vi.fn(() => ({ exec: vi.fn().mockResolvedValue([]) })),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [AbidingService, { provide: getModelToken(Abiding.name), useValue: abidingModel }],
    }).compile();

    service = module.get<AbidingService>(AbidingService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("getAbidingsByUserId", () => {
    // deletedAt: null hides abidings of a soft-deleted user, same as
    // getAbidings does when it's given a userId.
    it("scopes the query to the user's abidings that are not deleted", async () => {
      await service.getAbidingsByUserId(3);

      expect(abidingModel.find).toHaveBeenCalledWith({ userId: 3, deletedAt: null });
    });
  });
});
