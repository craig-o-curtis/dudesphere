import { UnauthorizedException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import { UserRole } from "../users/user.entity.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { PasswordResetService } from "./password-reset/password-reset.service.js";
import { SessionsService } from "./sessions/sessions.service.js";

describe("AuthController", () => {
  let controller: AuthController;

  const authService = { signup: vi.fn(), login: vi.fn() };
  const sessionsService = { refresh: vi.fn(), end: vi.fn(), endAll: vi.fn() };
  const passwordResetService = { requestEmail: vi.fn(), reset: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: SessionsService, useValue: sessionsService },
        { provide: PasswordResetService, useValue: passwordResetService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("signup", () => {
    it("passes the body to AuthService and returns what it returns", async () => {
      const body = {
        username: "walter",
        email: "w@x.com",
        password: "secret1",
        profile: { displayName: "Walter Sobchak" },
      };
      const created = { id: 4, username: "walter", email: "w@x.com" };
      authService.signup.mockResolvedValue(created);

      await expect(controller.signup(body)).resolves.toBe(created);
      expect(authService.signup).toHaveBeenCalledWith(body);
    });
  });

  describe("login", () => {
    const body = { identifier: "walter", password: "secret1" };

    it("hands the body to AuthService and answers with the tokens it returns", async () => {
      const tokens = { accessToken: "a.b.c", refreshToken: "r".repeat(43), expiresIn: 900 };
      authService.login.mockResolvedValue(tokens);

      await expect(controller.login(body)).resolves.toBe(tokens);

      expect(authService.login).toHaveBeenCalledWith(body);
    });

    it("lets the 401 through when the credentials are wrong", async () => {
      const refused = new UnauthorizedException("Invalid username, email or password");
      authService.login.mockRejectedValue(refused);

      await expect(controller.login(body)).rejects.toBe(refused);
    });
  });

  describe("refresh", () => {
    const refreshToken = "r".repeat(43);

    it("hands the refresh token to SessionsService and answers with the new pair", async () => {
      const tokens = { accessToken: "a.b.c", refreshToken: "s".repeat(43), expiresIn: 900 };
      sessionsService.refresh.mockResolvedValue(tokens);

      await expect(controller.refresh({ refreshToken })).resolves.toBe(tokens);

      expect(sessionsService.refresh).toHaveBeenCalledWith(refreshToken);
    });

    it("lets the service's 401 through", async () => {
      const refused = new UnauthorizedException("Invalid or expired refresh token");
      sessionsService.refresh.mockRejectedValue(refused);

      await expect(controller.refresh({ refreshToken })).rejects.toBe(refused);
    });
  });

  describe("logout", () => {
    it("hands the refresh token to SessionsService and answers with nothing", async () => {
      sessionsService.end.mockResolvedValue(undefined);

      await expect(controller.logout({ refreshToken: "r".repeat(43) })).resolves.toBeUndefined();

      expect(sessionsService.end).toHaveBeenCalledWith("r".repeat(43));
    });
  });

  describe("logoutAll", () => {
    // The id comes from the access token, so a caller can only ever log
    // themselves out.
    it("ends the sessions of the caller, by the id in their token", async () => {
      sessionsService.endAll.mockResolvedValue(undefined);
      const caller = { userId: 25, username: "walter", role: UserRole.USER };

      await expect(controller.logoutAll(caller)).resolves.toBeUndefined();

      expect(sessionsService.endAll).toHaveBeenCalledWith(25);
    });
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
