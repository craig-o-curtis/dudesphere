import { Test, TestingModule } from "@nestjs/testing";

import { AbidingService } from "./abiding.service.js";

describe("AbidingService", () => {
  let service: AbidingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AbidingService],
    }).compile();

    service = module.get<AbidingService>(AbidingService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });
});
