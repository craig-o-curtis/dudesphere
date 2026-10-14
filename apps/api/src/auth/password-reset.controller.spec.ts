import { PasswordResetService } from "@nestjs/authentication";
import { BadRequestException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import { PasswordResetController } from "./password-reset.controller.js";

// PasswordResetService is the package's, and has its own tests. These check
// what each handler hands it, and what it answers.
describe("PasswordResetController", () => {
  let controller: PasswordResetController;

  const passwordResetService = { request: vi.fn(), reset: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PasswordResetController],
      providers: [{ provide: PasswordResetService, useValue: passwordResetService }],
    }).compile();

    controller = module.get<PasswordResetController>(PasswordResetController);
  });

  describe("forgot", () => {
    it("asks for a link to the address", () => {
      passwordResetService.request.mockResolvedValue(undefined);

      controller.forgot({ email: "walter@example.com" });

      expect(passwordResetService.request).toHaveBeenCalledWith("walter@example.com");
    });

    // The whole point of the route: the answer must not depend on the work.
    // A promise that never settles stands for a slow lookup or a slow mail
    // server, and the controller has already returned.
    it("returns at once, without waiting for the email to be sent", () => {
      passwordResetService.request.mockReturnValue(new Promise(() => {}));

      expect(controller.forgot({ email: "walter@example.com" })).toBeUndefined();
    });
  });

  describe("reset", () => {
    const body = { token: "t".repeat(43), password: "a new secret" };

    it("hands the token and the new password on, and answers with nothing", async () => {
      passwordResetService.reset.mockResolvedValue({ userId: "25" });

      await expect(controller.reset(body)).resolves.toBeUndefined();

      expect(passwordResetService.reset).toHaveBeenCalledWith(body.token, "a new secret");
    });

    // The package answers null for a token that is unknown, used or expired,
    // or whose account changed since. All of them get one answer.
    it("answers 400 RESET_TOKEN_INVALID when the link does not work", async () => {
      passwordResetService.reset.mockResolvedValue(null);

      const thrown: unknown = await controller.reset(body).catch((error: unknown) => error);

      expect(thrown).toBeInstanceOf(BadRequestException);
      const exception = thrown as BadRequestException;
      expect(exception.errorCode).toBe("RESET_TOKEN_INVALID");
      expect(exception.message).toBe("Invalid or expired link");
    });
  });
});
