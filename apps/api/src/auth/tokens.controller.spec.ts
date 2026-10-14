import { TokenService } from "@nestjs/authentication";
import { Logger, UnauthorizedException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import { CredentialsService } from "./credentials.service.js";
import { TokensController } from "./tokens.controller.js";

// TokenService is the package's, and has its own tests. These check that
// each handler hands it the right values and answers with what it returns.
describe("TokensController", () => {
  let controller: TokensController;

  const credentialsService = { verify: vi.fn(), stillValid: vi.fn() };
  const tokenService = { issue: vi.fn(), refresh: vi.fn(), revoke: vi.fn() };

  // A made-up member. Nothing here is a real account.
  const walter = { id: 25, username: "walter", email: "walter@example.com" };
  const pair = { accessToken: "a.b.c", refreshToken: "r".repeat(43), expiresIn: 900 };

  // A UUID of any version, as randomUUID makes one.
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // The claims of the n-th call to tokenService.issue.
  function claimsOfIssue(callIndex = 0): { amr: unknown; sid: unknown } {
    const [, options] = tokenService.issue.mock.calls[callIndex] as [
      string,
      { claims: { amr: unknown; sid: unknown } },
    ];
    return options.claims;
  }

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

    // The account is still sound after the password check, unless a case
    // says otherwise.
    beforeEach(() => {
      credentialsService.stillValid.mockResolvedValue(true);
    });

    it("checks the identifier and password, then answers with the new pair", async () => {
      credentialsService.verify.mockResolvedValue(walter);
      tokenService.issue.mockResolvedValue(pair);

      await expect(controller.issue(body)).resolves.toBe(pair);

      expect(credentialsService.verify).toHaveBeenCalledWith("walter", "secret1");
    });

    // The id goes in as a string, the way the package keeps every user id.
    // `amr` says how the member signed in, and `sid` names this sign-in.
    // Both are carried into every refreshed token.
    it("issues the tokens for the member's id, signed in with a password", async () => {
      credentialsService.verify.mockResolvedValue(walter);
      tokenService.issue.mockResolvedValue(pair);

      await controller.issue(body);

      expect(tokenService.issue).toHaveBeenCalledTimes(1);
      expect(tokenService.issue).toHaveBeenCalledWith("25", {
        method: "password",
        claims: { amr: ["pwd"], sid: expect.stringMatching(UUID) as string },
      });
    });

    // JwtAuth checks the sid on every request. Two sign-ins that shared one
    // would end together.
    it("gives each sign-in its own sid", async () => {
      credentialsService.verify.mockResolvedValue(walter);
      tokenService.issue.mockResolvedValue(pair);

      await controller.issue(body);
      await controller.issue(body);

      expect(claimsOfIssue(0).sid).not.toBe(claimsOfIssue(1).sid);
    });

    // The recheck gets the member that verify returned, with the password
    // stamp verify read.
    it("checks the member again once the tokens are issued", async () => {
      credentialsService.verify.mockResolvedValue(walter);
      tokenService.issue.mockResolvedValue(pair);

      await controller.issue(body);

      expect(credentialsService.stillValid).toHaveBeenCalledTimes(1);
      expect(credentialsService.stillValid).toHaveBeenCalledWith(walter);
      const [issueOrder] = tokenService.issue.mock.invocationCallOrder;
      const [recheckOrder] = credentialsService.stillValid.mock.invocationCallOrder;
      expect(issueOrder).toBeLessThan(recheckOrder);
    });

    // The password changed, or the account closed, while the password was
    // being checked. The new sign-in would outlive that change, so it is
    // ended, and the caller gets the same answer as for a wrong password.
    it("ends the new sign-in and answers 401 BAD_CREDENTIALS when the recheck fails", async () => {
      credentialsService.verify.mockResolvedValue(walter);
      tokenService.issue.mockResolvedValue(pair);
      credentialsService.stillValid.mockResolvedValue(false);

      const thrown: unknown = await controller.issue(body).catch((error: unknown) => error);

      expect(thrown).toBeInstanceOf(UnauthorizedException);
      const exception = thrown as UnauthorizedException;
      expect(exception.errorCode).toBe("BAD_CREDENTIALS");
      expect(exception.message).toBe("Invalid username, email or password");
      expect(tokenService.revoke).toHaveBeenCalledTimes(1);
      expect(tokenService.revoke).toHaveBeenCalledWith(pair.refreshToken);
    });

    // Nobody holds the new refresh token, so a failure to end it changes
    // nothing for the caller.
    it("still answers 401 BAD_CREDENTIALS when ending the new sign-in fails", async () => {
      credentialsService.verify.mockResolvedValue(walter);
      tokenService.issue.mockResolvedValue(pair);
      credentialsService.stillValid.mockResolvedValue(false);
      tokenService.revoke.mockRejectedValue(new Error("the store is down"));
      const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => {});

      const thrown: unknown = await controller.issue(body).catch((error: unknown) => error);

      expect(thrown).toBeInstanceOf(UnauthorizedException);
      expect((thrown as UnauthorizedException).errorCode).toBe("BAD_CREDENTIALS");
      // Logged by member id, so the failure is seen. The token is not in it.
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain(`user ${walter.id}`);
      expect(warn.mock.calls[0][0]).not.toContain(pair.refreshToken);
      warn.mockRestore();
    });

    it("ends nothing when the recheck passes", async () => {
      credentialsService.verify.mockResolvedValue(walter);
      tokenService.issue.mockResolvedValue(pair);

      await expect(controller.issue(body)).resolves.toBe(pair);

      expect(tokenService.revoke).not.toHaveBeenCalled();
    });

    it("answers 401 BAD_CREDENTIALS, and issues nothing, when the check fails", async () => {
      credentialsService.verify.mockResolvedValue(null);

      const thrown: unknown = await controller.issue(body).catch((error: unknown) => error);

      expect(thrown).toBeInstanceOf(UnauthorizedException);
      const exception = thrown as UnauthorizedException;
      expect(exception.errorCode).toBe("BAD_CREDENTIALS");
      expect(exception.message).toBe("Invalid username, email or password");
      expect(tokenService.issue).not.toHaveBeenCalled();
      expect(credentialsService.stillValid).not.toHaveBeenCalled();
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
