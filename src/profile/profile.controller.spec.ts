import { Test, TestingModule } from "@nestjs/testing";

import { ProfileController } from "./profile.controller.js";
import { ProfileService } from "./profile.service.js";

describe("ProfileController", () => {
  let controller: ProfileController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfileController],
      // The controller needs a ProfileService. Give it an empty fake.
      providers: [{ provide: ProfileService, useValue: {} }],
    }).compile();

    controller = module.get<ProfileController>(ProfileController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });
});
