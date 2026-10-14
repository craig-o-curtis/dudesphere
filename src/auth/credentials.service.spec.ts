import type { PasswordHasher } from "@nestjs/authentication";
import * as bcrypt from "bcrypt";

import type { UsersRepository } from "../users/users.repository.js";
import { CredentialsService } from "./credentials.service.js";

// The PasswordHasher is a fake, because scrypt is slow on purpose. bcrypt is
// real, at its lowest cost, so the old hashes are checked the way they are
// in the app.
describe("CredentialsService", () => {
  const usersRepository = { findCredentials: vi.fn(), replacePasswordHash: vi.fn() };
  const passwordHasher = { verify: vi.fn(), hash: vi.fn(), needsRehash: vi.fn() };

  const service = new CredentialsService(
    usersRepository as unknown as UsersRepository,
    passwordHasher as unknown as PasswordHasher,
  );

  // A made-up member. Nothing here is a real account.
  const walter = { id: 25, username: "walter", email: "walter@example.com" };
  const scryptHash = "$scrypt$ln=17,r=8,p=1$salt$hash";
  let bcryptHash: string;

  beforeAll(async () => {
    bcryptHash = await bcrypt.hash("secret1", 4);
  });

  beforeEach(() => {
    vi.resetAllMocks();
    passwordHasher.needsRehash.mockReturnValue(false);
    passwordHasher.hash.mockResolvedValue("$scrypt$new");
    usersRepository.replacePasswordHash.mockResolvedValue(true);
  });

  describe("with a scrypt hash", () => {
    beforeEach(() => {
      usersRepository.findCredentials.mockResolvedValue({ user: walter, passwordHash: scryptHash });
    });

    it("returns the member when the password matches", async () => {
      passwordHasher.verify.mockResolvedValue(true);

      await expect(service.verify("walter", "secret1")).resolves.toBe(walter);

      expect(usersRepository.findCredentials).toHaveBeenCalledWith("walter");
      expect(passwordHasher.verify).toHaveBeenCalledWith("secret1", scryptHash);
    });

    it("returns null when the password is wrong", async () => {
      passwordHasher.verify.mockResolvedValue(false);

      await expect(service.verify("walter", "secret2")).resolves.toBeNull();

      expect(usersRepository.replacePasswordHash).not.toHaveBeenCalled();
    });

    it("leaves a hash with the current settings alone", async () => {
      passwordHasher.verify.mockResolvedValue(true);

      await service.verify("walter", "secret1");

      expect(passwordHasher.needsRehash).toHaveBeenCalledWith(scryptHash);
      expect(usersRepository.replacePasswordHash).not.toHaveBeenCalled();
    });

    // The cost settings went up since the hash was stored. The password is
    // at hand only now, so this is the one chance to upgrade it.
    it("stores a fresh hash when the settings changed", async () => {
      passwordHasher.verify.mockResolvedValue(true);
      passwordHasher.needsRehash.mockReturnValue(true);

      await expect(service.verify("walter", "secret1")).resolves.toBe(walter);

      expect(passwordHasher.hash).toHaveBeenCalledWith("secret1");
      expect(usersRepository.replacePasswordHash).toHaveBeenCalledWith(
        25,
        scryptHash,
        "$scrypt$new",
      );
    });

    // A wrong password must never be hashed and stored in place of the
    // right one.
    it("does not rehash on a wrong password, even when the settings changed", async () => {
      passwordHasher.verify.mockResolvedValue(false);
      passwordHasher.needsRehash.mockReturnValue(true);

      await expect(service.verify("walter", "secret2")).resolves.toBeNull();

      expect(passwordHasher.hash).not.toHaveBeenCalled();
      expect(usersRepository.replacePasswordHash).not.toHaveBeenCalled();
    });
  });

  describe("with no account", () => {
    // PasswordHasher checks a dummy hash when it gets none, so a missing
    // account takes as long as a wrong password.
    it("still checks the password, then returns null", async () => {
      usersRepository.findCredentials.mockResolvedValue(null);
      passwordHasher.verify.mockResolvedValue(false);

      await expect(service.verify("nobody@example.com", "secret1")).resolves.toBeNull();

      expect(passwordHasher.verify).toHaveBeenCalledTimes(1);
      expect(passwordHasher.verify).toHaveBeenCalledWith("secret1", undefined);
      expect(usersRepository.replacePasswordHash).not.toHaveBeenCalled();
    });
  });

  describe("with a bcrypt hash from before scrypt", () => {
    beforeEach(() => {
      usersRepository.findCredentials.mockResolvedValue({ user: walter, passwordHash: bcryptHash });
    });

    it("checks it with bcrypt and returns the member", async () => {
      await expect(service.verify("walter", "secret1")).resolves.toBe(walter);

      expect(passwordHasher.verify).not.toHaveBeenCalled();
    });

    // The password itself did not change, so passwordChangedAt stays as it
    // was and no access token is ended. The old hash goes along, so the
    // write is skipped if a password change landed in the meantime.
    it("replaces it with a scrypt hash, and leaves passwordChangedAt alone", async () => {
      await service.verify("walter", "secret1");

      expect(passwordHasher.hash).toHaveBeenCalledWith("secret1");
      expect(usersRepository.replacePasswordHash).toHaveBeenCalledTimes(1);
      expect(usersRepository.replacePasswordHash.mock.calls[0]).toEqual([
        25,
        bcryptHash,
        "$scrypt$new",
      ]);
    });

    it("returns null, and keeps the hash, when the password is wrong", async () => {
      await expect(service.verify("walter", "secret2")).resolves.toBeNull();

      expect(usersRepository.replacePasswordHash).not.toHaveBeenCalled();
    });

    // bcrypt reads only the first 72 bytes. Without the length check, any
    // password that starts with the right 72 bytes would sign in.
    it("refuses a password longer than bcrypt reads, even when its first 72 bytes match", async () => {
      const long = "a".repeat(72);
      usersRepository.findCredentials.mockResolvedValue({
        user: walter,
        passwordHash: await bcrypt.hash(long, 4),
      });

      await expect(service.verify("walter", long)).resolves.toBe(walter);
      await expect(service.verify("walter", `${long}b`)).resolves.toBeNull();
    });
  });
});
