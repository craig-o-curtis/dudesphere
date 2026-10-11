import { UnauthorizedException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import { UserRole } from "../users/user.entity.js";
import { AuthService } from "./auth.service.js";
import { TokenService } from "./token.service.js";
import { TokensController } from "./tokens.controller.js";

describe("TokensController", () => {
  let controller: TokensController;

  const authService = { verifyCredentials: vi.fn() };
  const tokenService = { issue: vi.fn(), refresh: vi.fn(), revoke: vi.fn(), revokeAll: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TokensController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: TokenService, useValue: tokenService },
      ],
    }).compile();

    controller = module.get(TokensController);
  });

  describe("issue", () => {
    const body = { identifier: "walter", password: "secret1" };

    it("checks the credentials, then answers with the tokens for that member", async () => {
      const walter = { id: 4, username: "walter" };
      const tokens = { accessToken: "a.b.c", refreshToken: "r".repeat(43), expiresIn: 900 };
      authService.verifyCredentials.mockResolvedValue(walter);
      tokenService.issue.mockResolvedValue(tokens);

      await expect(controller.issue(body)).resolves.toBe(tokens);

      expect(authService.verifyCredentials).toHaveBeenCalledWith(body);
      expect(tokenService.issue).toHaveBeenCalledWith(walter);
    });

    it("lets the 401 through and makes no token when the credentials are wrong", async () => {
      const refused = new UnauthorizedException("Invalid username, email or password");
      authService.verifyCredentials.mockRejectedValue(refused);

      await expect(controller.issue(body)).rejects.toBe(refused);

      expect(tokenService.issue).not.toHaveBeenCalled();
    });
  });

  describe("refresh", () => {
    const refreshToken = "r".repeat(43);

    it("hands the refresh token to TokenService and answers with the new pair", async () => {
      const tokens = { accessToken: "a.b.c", refreshToken: "s".repeat(43), expiresIn: 900 };
      tokenService.refresh.mockResolvedValue(tokens);

      await expect(controller.refresh({ refreshToken })).resolves.toBe(tokens);

      expect(tokenService.refresh).toHaveBeenCalledWith(refreshToken);
    });

    it("lets the service's 401 through", async () => {
      const refused = new UnauthorizedException("Invalid or expired refresh token");
      tokenService.refresh.mockRejectedValue(refused);

      await expect(controller.refresh({ refreshToken })).rejects.toBe(refused);
    });
  });

  describe("revoke", () => {
    it("hands the refresh token to TokenService and answers with nothing", async () => {
      tokenService.revoke.mockResolvedValue(undefined);

      await expect(controller.revoke({ refreshToken: "r".repeat(43) })).resolves.toBeUndefined();

      expect(tokenService.revoke).toHaveBeenCalledWith("r".repeat(43));
    });
  });

  describe("revokeAll", () => {
    // The id comes from the access token, so a caller can only ever sign
    // themselves out.
    it("ends the sessions of the caller, by the id in their token", async () => {
      tokenService.revokeAll.mockResolvedValue(undefined);
      const caller = { userId: 25, username: "walter", role: UserRole.USER };

      await expect(controller.revokeAll(caller)).resolves.toBeUndefined();

      expect(tokenService.revokeAll).toHaveBeenCalledWith(25);
    });
  });
});
