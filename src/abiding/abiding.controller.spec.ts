import { Test, TestingModule } from "@nestjs/testing";

import { AbidingController } from "./abiding.controller.js";

describe("AbidingController", () => {
  let controller: AbidingController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AbidingController],
    }).compile();

    controller = module.get<AbidingController>(AbidingController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });
});
