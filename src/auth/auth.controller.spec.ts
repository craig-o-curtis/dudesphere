import { Test, TestingModule } from "@nestjs/testing";

import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { PasswordResetService } from "./password-reset.service.js";

describe("AuthController", () => {
  let controller: AuthController;

  const passwordResetService = { requestEmail: vi.fn(), reset: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: {} },
        { provide: PasswordResetService, useValue: passwordResetService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("forgotPassword", () => {
    // The whole point of the route: the answer must not depend on the work.
    // A promise that never settles stands for a slow lookup or a slow mail
    // server, and the controller has already returned.
    it("returns at once, without waiting for the email to be sent", () => {
      passwordResetService.requestEmail.mockReturnValue(new Promise(() => {}));

      const result = controller.forgotPassword({ email: "w@x.com" });

      expect(result).toBeUndefined();
      expect(passwordResetService.requestEmail).toHaveBeenCalledWith("w@x.com");
    });
  });

  describe("resetPassword", () => {
    it("passes the token and the password on, and leaves confirmPassword behind", async () => {
      passwordResetService.reset.mockResolvedValue(undefined);

      await controller.resetPassword({
        token: "the-token",
        password: "secret1",
        confirmPassword: "secret1",
      });

      expect(passwordResetService.reset).toHaveBeenCalledWith("the-token", "secret1");
    });

    it("lets the service's 400 through", async () => {
      const refused = new Error("Invalid or expired link");
      passwordResetService.reset.mockRejectedValue(refused);

      await expect(
        controller.resetPassword({ token: "x", password: "secret1", confirmPassword: "secret1" }),
      ).rejects.toBe(refused);
    });
  });
});
