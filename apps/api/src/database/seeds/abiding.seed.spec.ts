import { getModelToken } from "@nestjs/mongoose";
import { Test } from "@nestjs/testing";

import { Abiding } from "../../abidings/abiding.schema.js";
import { AbidingSeedService } from "./abiding.seed.js";

describe("AbidingSeedService", () => {
  let seedService: AbidingSeedService;

  const abidingModel = {
    countDocuments: vi.fn(),
    insertMany: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    abidingModel.countDocuments.mockResolvedValue(0);

    const module = await Test.createTestingModule({
      providers: [
        AbidingSeedService,
        { provide: getModelToken(Abiding.name), useValue: abidingModel },
      ],
    }).compile();

    seedService = module.get(AbidingSeedService);
  });

  function seededRows() {
    return abidingModel.insertMany.mock.calls[0][0] as Record<string, unknown>[];
  }

  // The id used to be a fixed 1, which is only the admin's id in a database
  // that has never held another user.
  it("writes the sample abidings as the admin it is given", async () => {
    await seedService.seed("development", 42);

    expect(seededRows().length).toBeGreaterThan(0);
    expect(seededRows().map((row) => row.userId)).toEqual(seededRows().map(() => 42));
  });

  // The abiding once carried a copy of the author's name, set only here.
  it("writes no username onto an abiding", async () => {
    await seedService.seed("development", 42);

    for (const row of seededRows()) {
      expect(row).not.toHaveProperty("username");
    }
  });

  it("writes nothing outside development", async () => {
    await seedService.seed("production", 42);

    expect(abidingModel.insertMany).not.toHaveBeenCalled();
  });

  it("writes nothing when the collection already has abidings", async () => {
    abidingModel.countDocuments.mockResolvedValue(2);

    await seedService.seed("development", 42);

    expect(abidingModel.insertMany).not.toHaveBeenCalled();
  });

  it("writes nothing when no admin was seeded", async () => {
    await seedService.seed("development", null);

    expect(abidingModel.insertMany).not.toHaveBeenCalled();
  });
});
