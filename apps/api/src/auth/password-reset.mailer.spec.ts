import type { AuthenticationRegistry, PasswordResetLink } from "@nestjs/authentication";
import type { ConfigType } from "@nestjs/config";
import { getUtcNow } from "@northguild/gmt";
import type { DataSource } from "typeorm";

import type { MailProvider } from "../mail/mail.provider.js";
import { ClockUnavailableException } from "../shared/exceptions/clock-unavailable.exception.js";
import { isoToDate } from "../shared/utils/iso-timestamp-transformer.js";
import type { SignInsRepository } from "../typeorm/sign-ins.repository.js";
import type { UsersRepository } from "../users/users.repository.js";
import type authConfig from "./config/auth.config.js";
import { PasswordResetMailer } from "./password-reset.mailer.js";

// Mocked so the time stamped on a reset is known, and so the "" that gmt
// returns when it cannot read the clock is reachable.
vi.mock("@northguild/gmt", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@northguild/gmt")>()),
  getUtcNow: vi.fn(),
}));

const UTC_NOW = "2026-10-14T09:25:42.204006202Z";

// The package makes, stores and checks the links, and has its own tests.
// These check the app's half: finding the account, the email, and storing
// the new hash.
describe("PasswordResetMailer", () => {
  const usersRepository = {
    findCredentials: vi.fn(),
    findById: vi.fn(),
    updatePasswordHash: vi.fn(),
  };
  const mailProvider = { send: vi.fn() };
  const signIns = { endAllForUser: vi.fn() };
  const registry = { registerHandler: vi.fn() };

  // A fake EntityManager, and a DataSource whose transaction() runs the
  // callback with it, as a real one does.
  const manager = { name: "the transaction's manager" };
  const dataSource = { transaction: vi.fn() };

  // A made-up member. Nothing here is a real account.
  const walter = { id: 25, username: "walter", email: "walter@example.com" };

  const link: PasswordResetLink = {
    userId: "25",
    email: "walter@example.com",
    url: "https://app.example.com/reset-password?token=t0k3n",
    expiresAt: isoToDate("2026-10-14T10:25:42Z"),
  };

  function mailerWithLinkLifetime(passwordResetExpiresIn: number): PasswordResetMailer {
    return new PasswordResetMailer(
      usersRepository as unknown as UsersRepository,
      mailProvider as unknown as MailProvider,
      { passwordResetExpiresIn } as ConfigType<typeof authConfig>,
      dataSource as unknown as DataSource,
      signIns as unknown as SignInsRepository,
      registry as unknown as AuthenticationRegistry,
    );
  }

  let mailer: PasswordResetMailer;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getUtcNow).mockReturnValue(UTC_NOW);
    mailProvider.send.mockResolvedValue(undefined);
    usersRepository.updatePasswordHash.mockResolvedValue(true);
    signIns.endAllForUser.mockResolvedValue(undefined);
    dataSource.transaction.mockImplementation((work: (m: typeof manager) => unknown) =>
      work(manager),
    );
    mailer = mailerWithLinkLifetime(3600);
  });

  // Without this, the package has no one to send its links.
  it("registers itself as the password reset handler", () => {
    expect(registry.registerHandler).toHaveBeenCalledTimes(1);
    expect(registry.registerHandler).toHaveBeenCalledWith("passwordReset", mailer);
  });

  describe("findUser", () => {
    // The id as a string, as the package keeps every user id. The hash goes
    // with it, so a link stops working once the password changes.
    it("returns the account's id, stored address and hash", async () => {
      usersRepository.findCredentials.mockResolvedValue({
        user: walter,
        passwordHash: "$scrypt$stored",
      });

      await expect(mailer.findUser("walter@example.com")).resolves.toEqual({
        id: "25",
        email: "walter@example.com",
        passwordHash: "$scrypt$stored",
      });
      expect(usersRepository.findCredentials).toHaveBeenCalledWith("walter@example.com");
    });

    it("returns null when no account has the address", async () => {
      usersRepository.findCredentials.mockResolvedValue(null);

      await expect(mailer.findUser("nobody@example.com")).resolves.toBeNull();
    });
  });

  describe("send", () => {
    beforeEach(() => {
      usersRepository.findById.mockResolvedValue(walter);
    });

    it("emails the link to the address the package gives", async () => {
      await mailer.send(link);

      expect(usersRepository.findById).toHaveBeenCalledWith(25);
      expect(mailProvider.send).toHaveBeenCalledTimes(1);
      expect(mailProvider.send).toHaveBeenCalledWith({
        to: "walter@example.com",
        subject: "Reset your Dudesphere password",
        text: expect.any(String) as string,
      });
    });

    it("greets the member by username and includes the link", async () => {
      await mailer.send(link);

      const [{ text }] = mailProvider.send.mock.calls[0] as [{ text: string }];
      expect(text).toMatch(/^Hi walter,\n/);
      expect(text).toContain(`\n${link.url}\n`);
    });

    // PASSWORD_RESET_EXPIRES_IN is in seconds. The email says minutes.
    it.each([
      [3600, "60 minutes"],
      [900, "15 minutes"],
    ])("says a link that lasts %i seconds stops working in %s", async (seconds, minutes) => {
      await mailerWithLinkLifetime(seconds).send(link);

      const [{ text }] = mailProvider.send.mock.calls[0] as [{ text: string }];
      expect(text).toContain(`stops working in ${minutes}.`);
    });

    // The account was closed between the request and the send.
    it("sends nothing when the member is gone", async () => {
      usersRepository.findById.mockResolvedValue(null);

      await expect(mailer.send(link)).resolves.toBeUndefined();

      expect(mailProvider.send).not.toHaveBeenCalled();
    });

    // The package logs it. Swallowing it here would hide a mail server that
    // is down.
    it("lets a failed send through", async () => {
      const down = new Error("mail server down");
      mailProvider.send.mockRejectedValue(down);

      await expect(mailer.send(link)).rejects.toBe(down);
    });
  });

  describe("updatePassword", () => {
    // The time is stamped as passwordChangedAt, so access tokens signed
    // before the reset stop working at once.
    it("stores the new hash and the time of the change", async () => {
      await expect(mailer.updatePassword("25", "$scrypt$new")).resolves.toBeUndefined();

      expect(usersRepository.updatePasswordHash).toHaveBeenCalledWith(
        25,
        "$scrypt$new",
        UTC_NOW,
        manager,
      );
    });

    // Saved together or not at all: a reset must never leave the old
    // sign-ins going beside the new password.
    it("stores the hash and ends every sign-in in one transaction", async () => {
      await mailer.updatePassword("25", "$scrypt$new");

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(usersRepository.updatePasswordHash).toHaveBeenCalledTimes(1);
      expect(signIns.endAllForUser).toHaveBeenCalledTimes(1);
      expect(signIns.endAllForUser).toHaveBeenCalledWith(25, manager);
      // Both writes go through the transaction's own manager.
      expect(usersRepository.updatePasswordHash.mock.calls[0][3]).toBe(manager);
      expect(signIns.endAllForUser.mock.calls[0][1]).toBe(manager);
    });

    // The hash goes first. If it fails, the transaction rolls back before
    // any sign-in is ended.
    it("stores the hash before it ends the sign-ins", async () => {
      await mailer.updatePassword("25", "$scrypt$new");

      const [hashOrder] = usersRepository.updatePasswordHash.mock.invocationCallOrder;
      const [endOrder] = signIns.endAllForUser.mock.invocationCallOrder;
      expect(hashOrder).toBeLessThan(endOrder);
    });

    // Swallowing the error would commit the new hash with the old sign-ins
    // still going. Letting it through makes the transaction roll back.
    it("lets a failure to end the sign-ins through", async () => {
      const down = new Error("database down");
      signIns.endAllForUser.mockRejectedValue(down);

      await expect(mailer.updatePassword("25", "$scrypt$new")).rejects.toBe(down);
    });

    // A blank passwordChangedAt would leave the old tokens working.
    it("stores nothing when the clock cannot be read", async () => {
      vi.mocked(getUtcNow).mockReturnValue("");

      await expect(mailer.updatePassword("25", "$scrypt$new")).rejects.toBeInstanceOf(
        ClockUnavailableException,
      );
      expect(usersRepository.updatePasswordHash).not.toHaveBeenCalled();
      expect(signIns.endAllForUser).not.toHaveBeenCalled();
    });
  });
});
