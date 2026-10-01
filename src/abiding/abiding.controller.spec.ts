import { Test, TestingModule } from "@nestjs/testing";

import { UsersService } from "../users/users.service.js";
import { AbidingController } from "./abiding.controller.js";
import { AbidingService } from "./abiding.service.js";

describe("AbidingController", () => {
  let controller: AbidingController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AbidingController],
      providers: [
        { provide: AbidingService, useValue: {} },
        { provide: UsersService, useValue: {} },
      ],
    }).compile();

    controller = module.get<AbidingController>(AbidingController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });
});
