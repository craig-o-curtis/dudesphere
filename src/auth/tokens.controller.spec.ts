import { TokenService } from "@nestjs/authentication";
import { UnauthorizedException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import { CredentialsService } from "./credentials.service.js";
import { TokensController } from "./tokens.controller.js";

// TokenService is the package's, and has its own tests. These check that
// each handler hands it the right values and answers with what it returns.
describe("TokensController", () => {
  let controller: TokensController;

  const credentialsService = { verify: vi.fn() };
  const tokenService = { issue: vi.fn(), refresh: vi.fn(), revoke: vi.fn() };

  // A made-up member. Nothing here is a real account.
  const walter = { id: 25, username: "walter", email: "walter@example.com" };
  const pair = { accessToken: "a.b.c", refreshToken: "r".repeat(43), expiresIn: 900 };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TokensController],
      providers: [
        { provide: CredentialsService, useValue: credentialsService },
        { provide: TokenService, useValue: tokenService },
      ],
    }).compile();

    controller = module.get<TokensController>(TokensController);
  });

  describe("issue", () => {
    const body = { identifier: "walter", password: "secret1" };

    it("checks the identifier and password, then answers with the new pair", async () => {
      credentialsService.verify.mockResolvedValue(walter);
      tokenService.issue.mockResolvedValue(pair);

      await expect(controller.issue(body)).resolves.toBe(pair);

      expect(credentialsService.verify).toHaveBeenCalledWith("walter", "secret1");
    });

    // The id goes in as a string, the way the package keeps every user id.
    // `amr` says how the member signed in, and is carried into every
    // refreshed token.
    it("issues the tokens for the member's id, signed in with a password", async () => {
      credentialsService.verify.mockResolvedValue(walter);
      tokenService.issue.mockResolvedValue(pair);

      await controller.issue(body);

      expect(tokenService.issue).toHaveBeenCalledTimes(1);
      expect(tokenService.issue).toHaveBeenCalledWith("25", {
        method: "password",
        claims: { amr: ["pwd"] },
      });
    });

    it("answers 401 BAD_CREDENTIALS, and issues nothing, when the check fails", async () => {
      credentialsService.verify.mockResolvedValue(null);

      const thrown: unknown = await controller.issue(body).catch((error: unknown) => error);

      expect(thrown).toBeInstanceOf(UnauthorizedException);
      const exception = thrown as UnauthorizedException;
      expect(exception.errorCode).toBe("BAD_CREDENTIALS");
      expect(exception.message).toBe("Invalid username, email or password");
      expect(tokenService.issue).not.toHaveBeenCalled();
    });
  });

  describe("refresh", () => {
    const refreshToken = "r".repeat(43);

    it("hands the refresh token to TokenService and answers with the new pair", async () => {
      tokenService.refresh.mockResolvedValue(pair);

      await expect(controller.refresh({ refreshToken })).resolves.toBe(pair);

      expect(tokenService.refresh).toHaveBeenCalledWith(refreshToken);
    });

    // An unknown, expired or reused token is refused by the package. The
    // controller must not turn that into anything else.
    it("lets TokenService's refusal through", async () => {
      const refused = new UnauthorizedException("Invalid refresh token");
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
});
