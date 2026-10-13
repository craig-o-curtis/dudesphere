import { createHash } from "node:crypto";

import {
  BadRequestException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { addUtc, getUtcNow, isAfterUtc } from "@northguild/gmt";

import { MailProvider } from "../../mail/mail.provider.js";
import { ErrorCode } from "../../shared/error-codes.js";
import { UsersService } from "../../users/users.service.js";
import authConfig from "../config/auth.config.js";
import { PasswordResetToken } from "./password-reset-token.entity.js";
import { PasswordResetService } from "./password-reset.service.js";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

describe("PasswordResetService", () => {
  let service: PasswordResetService;

  // One query builder stands for every createQueryBuilder() call. Each step
  // returns it, as TypeORM's does, and execute() is what a test sets.
  const queryBuilder = {
    delete: vi.fn(),
    where: vi.fn(),
    returning: vi.fn(),
    execute: vi.fn(),
  };
  const tokensRepository = {
    createQueryBuilder: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
  };
  const usersService = { getUserByEmail: vi.fn(), updateUser: vi.fn() };
  const mailProvider = { send: vi.fn() };

  const user = { id: 7, username: "walter", email: "w@x.com" };

  beforeEach(async () => {
    vi.clearAllMocks();
    queryBuilder.delete.mockReturnValue(queryBuilder);
    queryBuilder.where.mockReturnValue(queryBuilder);
    queryBuilder.returning.mockReturnValue(queryBuilder);
    queryBuilder.execute.mockResolvedValue({ raw: [] });
    tokensRepository.createQueryBuilder.mockReturnValue(queryBuilder);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PasswordResetService,
        { provide: getRepositoryToken(PasswordResetToken), useValue: tokensRepository },
        { provide: UsersService, useValue: usersService },
        { provide: MailProvider, useValue: mailProvider },
        {
          provide: authConfig.KEY,
          useValue: { frontendUrl: "https://dudesphere.test", passwordResetExpiresIn: 1800 },
        },
      ],
    }).compile();

    service = module.get(PasswordResetService);
  });

  /** The token in the link of the one email that was sent. */
  function tokenInEmail(): string {
    const { text } = mailProvider.send.mock.calls[0][0] as { text: string };
    const link = /https:\/\/\S+/.exec(text)?.[0] ?? "";
    return new URL(link).searchParams.get("token") ?? "";
  }

  describe("request", () => {
    it("does nothing at all for an email with no account", async () => {
      usersService.getUserByEmail.mockResolvedValue(null);

      await service.requestEmail("nobody@x.com");

      expect(tokensRepository.createQueryBuilder).not.toHaveBeenCalled();
      expect(tokensRepository.insert).not.toHaveBeenCalled();
      expect(mailProvider.send).not.toHaveBeenCalled();
    });

    it("emails a link to the address on the account", async () => {
      // Looked up as typed, in capitals. The stored address is what gets the mail.
      usersService.getUserByEmail.mockResolvedValue(user);

      await service.requestEmail("W@X.COM");

      expect(usersService.getUserByEmail).toHaveBeenCalledWith("W@X.COM");
      expect(mailProvider.send).toHaveBeenCalledTimes(1);
      const message = mailProvider.send.mock.calls[0][0] as { to: string; text: string };
      expect(message.to).toBe("w@x.com");
      expect(message.text).toContain("Hi walter,");
      expect(message.text).toContain("https://dudesphere.test/reset-password?token=");
      // 1800 seconds, said the way a person reads it.
      expect(message.text).toContain("stops working in 30 minutes");
    });

    it("stores the hash of the token, and never the token", async () => {
      usersService.getUserByEmail.mockResolvedValue(user);

      await service.requestEmail("w@x.com");

      const token = tokenInEmail();
      // 32 random bytes as base64url.
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

      const stored = tokensRepository.insert.mock.calls[0][0] as Record<string, unknown>;
      expect(stored.userId).toBe(7);
      expect(stored.tokenHash).toBe(sha256(token));
      expect(Object.values(stored)).not.toContain(token);
    });

    it("sets the expiry 1800 seconds ahead", async () => {
      usersService.getUserByEmail.mockResolvedValue(user);

      await service.requestEmail("w@x.com");

      const { expiresAt } = tokensRepository.insert.mock.calls[0][0] as { expiresAt: string };
      // Between 1790 and 1800 seconds from now: the clock has moved a little
      // since the service read it, and never by ten seconds.
      const now = getUtcNow();
      expect(isAfterUtc(expiresAt, addUtc(now, { seconds: 1790 }))).toBe(true);
      expect(isAfterUtc(expiresAt, addUtc(now, { seconds: 1800 }))).toBe(false);
    });

    it("gives every link a different token", async () => {
      usersService.getUserByEmail.mockResolvedValue(user);

      await service.requestEmail("w@x.com");
      await service.requestEmail("w@x.com");

      const [first, second] = tokensRepository.insert.mock.calls.map(
        ([row]) => (row as { tokenHash: string }).tokenHash,
      );
      expect(first).not.toBe(second);
    });

    // Before the new row goes in, so the user never has two working links.
    it("deletes the user's earlier links and every expired one first", async () => {
      usersService.getUserByEmail.mockResolvedValue(user);

      await service.requestEmail("w@x.com");

      expect(queryBuilder.where).toHaveBeenCalledWith(
        `"expiresAt" <= CURRENT_TIMESTAMP OR "userId" = :userId`,
        { userId: 7 },
      );
      expect(queryBuilder.execute.mock.invocationCallOrder[0]).toBeLessThan(
        tokensRepository.insert.mock.invocationCallOrder[0],
      );
    });

    // The controller does not wait for requestEmail(), so a rejection here
    // would have nobody to catch it.
    it.each([
      ["the lookup", () => usersService.getUserByEmail.mockRejectedValue(new Error("db down"))],
      [
        "the mail server",
        () => {
          usersService.getUserByEmail.mockResolvedValue(user);
          mailProvider.send.mockRejectedValue(new Error("smtp down"));
        },
      ],
    ])("resolves even when %s fails", async (_what, arrange) => {
      arrange();

      await expect(service.requestEmail("w@x.com")).resolves.toBeUndefined();
    });

    // A mail server's refusal can quote the address it refused.
    it("logs what kind of failure it was, and not the message", async () => {
      const errorLog = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
      usersService.getUserByEmail.mockResolvedValue(user);
      mailProvider.send.mockRejectedValue(
        new ServiceUnavailableException("Mail could not be sent", {
          cause: Object.assign(new Error("550 5.1.1 <w@x.com>: Recipient address rejected"), {
            code: "EENVELOPE",
          }),
          errorCode: ErrorCode.MAIL_UNAVAILABLE,
        }),
      );

      await service.requestEmail("w@x.com");

      expect(errorLog).toHaveBeenCalledWith(
        "Could not send a password reset link: ServiceUnavailableException MAIL_UNAVAILABLE EENVELOPE",
      );
      errorLog.mockRestore();
    });
  });

  describe("reset", () => {
    it("sets the password for the user the token belongs to", async () => {
      queryBuilder.execute.mockResolvedValue({ raw: [{ userId: 7 }] });
      usersService.updateUser.mockResolvedValue(user);

      await service.reset("the-token", "new-secret");

      // Found by its hash, and only while it has not expired. The same
      // statement deletes it, which is what makes a link work once.
      expect(queryBuilder.delete).toHaveBeenCalled();
      expect(queryBuilder.where).toHaveBeenCalledWith(
        `"tokenHash" = :tokenHash AND "expiresAt" > CURRENT_TIMESTAMP`,
        { tokenHash: sha256("the-token") },
      );
      // updateUser is where the password is hashed, so it gets the plain one.
      expect(usersService.updateUser).toHaveBeenCalledWith(7, { password: "new-secret" });
    });

    it("then deletes every other link the user has", async () => {
      queryBuilder.execute.mockResolvedValue({ raw: [{ userId: 7 }] });
      usersService.updateUser.mockResolvedValue(user);

      await service.reset("the-token", "new-secret");

      expect(tokensRepository.delete).toHaveBeenCalledWith({ userId: 7 });
    });

    it("throws 400 and sets no password when no row matches the token", async () => {
      queryBuilder.execute.mockResolvedValue({ raw: [] });

      const attempt = service.reset("not-a-token", "new-secret");

      await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
      await expect(attempt).rejects.toMatchObject({
        message: "Invalid or expired link",
        errorCode: "RESET_TOKEN_INVALID",
      });
      expect(usersService.updateUser).not.toHaveBeenCalled();
    });

    // The user was deleted between the email and the click. To the caller it
    // is one more link that no longer works, not a 404 that names a user id.
    it("throws the same 400 when the user is gone", async () => {
      queryBuilder.execute.mockResolvedValue({ raw: [{ userId: 7 }] });
      usersService.updateUser.mockRejectedValue(new NotFoundException("User #7 not found"));

      await expect(service.reset("the-token", "new-secret")).rejects.toMatchObject({
        message: "Invalid or expired link",
        errorCode: "RESET_TOKEN_INVALID",
      });
    });

    it("lets any other failure through as it is", async () => {
      const fault = new Error("db down");
      queryBuilder.execute.mockResolvedValue({ raw: [{ userId: 7 }] });
      usersService.updateUser.mockRejectedValue(fault);

      await expect(service.reset("the-token", "new-secret")).rejects.toBe(fault);
    });
  });
});
