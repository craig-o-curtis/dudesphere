import { UnauthorizedException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import { AuthService } from "./auth.service.js";
import { TokenService } from "./token.service.js";
import { TokensController } from "./tokens.controller.js";

describe("TokensController", () => {
  let controller: TokensController;

  const authService = { verifyCredentials: vi.fn() };
  const tokenService = { issue: vi.fn() };

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
      const tokens = { accessToken: "a.b.c", expiresIn: 900 };
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
});
