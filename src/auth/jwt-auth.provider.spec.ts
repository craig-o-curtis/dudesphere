import type { AuthenticationRegistry } from "@nestjs/authentication";
import { convertUtcToUnix } from "@northguild/gmt";

import type { UsersRepository } from "../users/users.repository.js";
import { JwtAuth } from "./jwt-auth.provider.js";

// The package checks the signature, `exp`, `iss` and `aud` before validate()
// runs, and has its own tests for that. These call validate() directly with
// claims that already passed those checks.
describe("JwtAuth", () => {
  const usersRepository = { findById: vi.fn() };
  const registry = { registerProvider: vi.fn() };

  let provider: JwtAuth;

  // A made-up member who has never changed their password.
  const walter = { id: 25, username: "walter", passwordChangedAt: null };

  // The second the password changed, in seconds since 1970, and the
  // timestamp itself, half a second into that second.
  const changedAt = "2026-10-14T09:00:00.500Z";
  const changedSecond = convertUtcToUnix(changedAt, { epochUnit: "seconds" }) as number;

  beforeEach(() => {
    vi.resetAllMocks();
    provider = new JwtAuth(
      usersRepository as unknown as UsersRepository,
      registry as unknown as AuthenticationRegistry,
    );
  });

  // Without this, the guard never asks it about a bearer token.
  it("registers itself with the authentication registry", () => {
    expect(registry.registerProvider).toHaveBeenCalledTimes(1);
    expect(registry.registerProvider).toHaveBeenCalledWith(provider);
  });

  describe("validate", () => {
    it("loads the member named by `sub` and returns them", async () => {
      usersRepository.findById.mockResolvedValue(walter);

      await expect(provider.validate({ sub: "25", iat: changedSecond })).resolves.toBe(walter);

      expect(usersRepository.findById).toHaveBeenCalledWith(25);
    });

    // A soft-deleted member is not found, so a closed account's tokens stop
    // working at once.
    it("returns null when no member has that id", async () => {
      usersRepository.findById.mockResolvedValue(null);

      await expect(provider.validate({ sub: "25", iat: changedSecond })).resolves.toBeNull();
    });

    // `sub` is always String(user.id). Anything else was not signed by this
    // app, so it is refused without a database read.
    it.each([
      ["no sub", undefined],
      ["an empty sub", ""],
      ["zero", "0"],
      ["a leading zero", "025"],
      ["a negative id", "-25"],
      ["a fraction", "2.5"],
      ["a space", " 25"],
      ["a username", "walter"],
    ])("returns null for %s, without a lookup", async (_what, sub) => {
      await expect(provider.validate({ sub, iat: changedSecond })).resolves.toBeNull();

      expect(usersRepository.findById).not.toHaveBeenCalled();
    });

    it.each([
      ["no iat", undefined],
      ["an iat that is text", String(changedSecond)],
    ])("returns null for %s, without a lookup", async (_what, iat) => {
      await expect(
        provider.validate({ sub: "25", iat: iat as unknown as number }),
      ).resolves.toBeNull();

      expect(usersRepository.findById).not.toHaveBeenCalled();
    });

    describe("after a password change", () => {
      const changed = { ...walter, passwordChangedAt: changedAt };

      beforeEach(() => {
        usersRepository.findById.mockResolvedValue(changed);
      });

      it("accepts a token signed after the change", async () => {
        await expect(provider.validate({ sub: "25", iat: changedSecond + 60 })).resolves.toBe(
          changed,
        );
      });

      // A token records only whole seconds. One signed in the same second
      // as the change is far more often the member signing in straight
      // after a reset than an old token.
      it("accepts a token signed in the same second as the change", async () => {
        await expect(provider.validate({ sub: "25", iat: changedSecond })).resolves.toBe(changed);
      });

      // Whoever holds it signed in with the old password.
      it("refuses a token signed in the second before the change", async () => {
        await expect(provider.validate({ sub: "25", iat: changedSecond - 1 })).resolves.toBeNull();
      });

      it("refuses a token signed long before the change", async () => {
        await expect(
          provider.validate({ sub: "25", iat: changedSecond - 86_400 }),
        ).resolves.toBeNull();
      });

      // The second before ends exactly when the change happens. The change
      // is not after the token, so the token is still refused.
      it("refuses a token from the second before a change made on the second", async () => {
        const onTheSecond = { ...walter, passwordChangedAt: "2026-10-14T09:00:00.000Z" };
        usersRepository.findById.mockResolvedValue(onTheSecond);

        await expect(provider.validate({ sub: "25", iat: changedSecond - 1 })).resolves.toBeNull();
        await expect(provider.validate({ sub: "25", iat: changedSecond })).resolves.toBe(
          onTheSecond,
        );
      });

      // A stored time that cannot be read must fail closed.
      it("refuses the token when passwordChangedAt cannot be read", async () => {
        usersRepository.findById.mockResolvedValue({ ...walter, passwordChangedAt: "not a time" });

        await expect(provider.validate({ sub: "25", iat: changedSecond + 60 })).resolves.toBeNull();
      });
    });
  });
});
