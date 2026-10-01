import { getModelToken } from "@nestjs/mongoose";
import { Test, TestingModule } from "@nestjs/testing";

import { Abiding } from "./abiding.schema.js";
import { AbidingService } from "./abiding.service.js";

describe("AbidingService", () => {
  let service: AbidingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AbidingService, { provide: getModelToken(Abiding.name), useValue: {} }],
    }).compile();

    service = module.get<AbidingService>(AbidingService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });
});
