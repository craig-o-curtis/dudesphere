import { SignInService } from "@nestjs/authentication";
import { Test, TestingModule } from "@nestjs/testing";

import { SessionsController } from "./sessions.controller.js";

describe("SessionsController", () => {
  let controller: SessionsController;

  const signInService = { signOutEverywhere: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SessionsController],
      providers: [{ provide: SignInService, useValue: signInService }],
    }).compile();

    controller = module.get<SessionsController>(SessionsController);
  });

  describe("signOutEverywhere", () => {
    // The id comes from the access token, so a caller can only ever sign
    // themselves out. The package keeps user ids as strings.
    it("signs the caller out everywhere, by the id in their token", async () => {
      signInService.signOutEverywhere.mockResolvedValue(undefined);

      await expect(controller.signOutEverywhere(25)).resolves.toBeUndefined();

      expect(signInService.signOutEverywhere).toHaveBeenCalledTimes(1);
      expect(signInService.signOutEverywhere).toHaveBeenCalledWith("25");
    });
  });
});
