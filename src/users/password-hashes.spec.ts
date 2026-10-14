import type { PasswordHasher } from "@nestjs/authentication";
import * as bcrypt from "bcrypt";

import { isBcryptHash, needsRehash, verifyPassword } from "./password-hashes.js";

// The bcrypt path runs real bcrypt, at cost 4 so it stays fast: the point is
// that an old hash still verifies. The scrypt path is PasswordHasher's own
// job, so a fake stands in for it and these cases check only the hand-off.
describe("password hashes", () => {
  // A scrypt hash in PasswordHasher's format. Only its prefix matters here.
  const scryptHash = "$scrypt$ln=17,r=8,p=1$c2FsdA$aGFzaA";

  const passwordHasher = {
    hash: vi.fn(),
    verify: vi.fn(),
    needsRehash: vi.fn(),
  };
  // The functions take the real type. The fake has the three methods they call.
  const hasher = passwordHasher as unknown as PasswordHasher;

  // Exactly 72 bytes, bcrypt's limit, and a hash made from it.
  const longestPassword = "a".repeat(72);
  let bcryptHash: string;
  let longestHash: string;

  beforeAll(async () => {
    bcryptHash = await bcrypt.hash("rug-tied-the-room", 4);
    longestHash = await bcrypt.hash(longestPassword, 4);
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isBcryptHash", () => {
    // $2b is what the bcrypt package wrote. $2a and $2y are older spellings
    // of the same scheme.
    it.each(["$2a$", "$2b$", "$2y$"])("is true for a hash starting %s", (prefix) => {
      expect(isBcryptHash(`${prefix}04$abcdefghijklmnopqrstuv`)).toBe(true);
    });

    it("is true for a hash the bcrypt package made", () => {
      expect(isBcryptHash(bcryptHash)).toBe(true);
    });

    it("is false for a scrypt hash", () => {
      expect(isBcryptHash(scryptHash)).toBe(false);
    });

    // The prefix has to be at the start, and has to be a known version.
    it.each(["$2x$04$abc", "x$2b$04$abc", ""])("is false for %j", (hash) => {
      expect(isBcryptHash(hash)).toBe(false);
    });
  });

  describe("verifyPassword", () => {
    describe("with a bcrypt hash", () => {
      it("is true for the right password", async () => {
        await expect(verifyPassword(hasher, "rug-tied-the-room", bcryptHash)).resolves.toBe(true);
      });

      it("is false for a wrong password", async () => {
        await expect(verifyPassword(hasher, "not-the-rug", bcryptHash)).resolves.toBe(false);
      });

      // bcrypt checks it, so PasswordHasher, which cannot read the hash,
      // is never asked.
      it("does not ask PasswordHasher", async () => {
        await verifyPassword(hasher, "rug-tied-the-room", bcryptHash);

        expect(passwordHasher.verify).not.toHaveBeenCalled();
      });

      it("is true for a password of exactly 72 bytes", async () => {
        await expect(verifyPassword(hasher, longestPassword, longestHash)).resolves.toBe(true);
      });

      // bcrypt alone says true here, because it never reads past byte 72.
      // No stored hash came from a longer password, so a longer one is wrong.
      it("is false for a longer password that starts with the right 72 bytes", async () => {
        await expect(verifyPassword(hasher, `${longestPassword}x`, longestHash)).resolves.toBe(
          false,
        );
      });

      // The limit is in bytes, not characters: 37 "é" is 74 bytes.
      it("counts the limit in bytes", async () => {
        const accented = "é".repeat(36);
        const accentedHash = await bcrypt.hash(accented, 4);

        await expect(verifyPassword(hasher, accented, accentedHash)).resolves.toBe(true);
        await expect(verifyPassword(hasher, `${accented}é`, accentedHash)).resolves.toBe(false);
      });
    });

    describe("with any other hash", () => {
      it("hands the check to PasswordHasher and returns its answer", async () => {
        passwordHasher.verify.mockResolvedValue(true);

        await expect(verifyPassword(hasher, "rug-tied-the-room", scryptHash)).resolves.toBe(true);

        // The typed password first, the stored hash second.
        expect(passwordHasher.verify).toHaveBeenCalledWith("rug-tied-the-room", scryptHash);
      });

      it("is false when PasswordHasher says no", async () => {
        passwordHasher.verify.mockResolvedValue(false);

        await expect(verifyPassword(hasher, "not-the-rug", scryptHash)).resolves.toBe(false);
      });

      // No 72-byte rule for scrypt. A long password goes to PasswordHasher.
      it("lets PasswordHasher judge a password over 72 bytes", async () => {
        passwordHasher.verify.mockResolvedValue(true);

        await expect(verifyPassword(hasher, `${longestPassword}x`, scryptHash)).resolves.toBe(true);
      });
    });

    // An unknown account has no hash. PasswordHasher then checks a dummy
    // hash, so the answer takes as long as for a wrong password.
    it.each([undefined, null])(
      "hands the check to PasswordHasher when the hash is %s",
      async (hash) => {
        passwordHasher.verify.mockResolvedValue(false);

        await expect(verifyPassword(hasher, "rug-tied-the-room", hash)).resolves.toBe(false);

        expect(passwordHasher.verify).toHaveBeenCalledWith("rug-tied-the-room", hash);
      },
    );
  });

  describe("needsRehash", () => {
    // Every bcrypt hash is replaced with a scrypt one at its owner's next
    // sign-in, whatever PasswordHasher would say.
    it("is true for a bcrypt hash, without asking PasswordHasher", () => {
      expect(needsRehash(hasher, bcryptHash)).toBe(true);
      expect(passwordHasher.needsRehash).not.toHaveBeenCalled();
    });

    it.each([true, false])("returns PasswordHasher's %s for a scrypt hash", (answer) => {
      passwordHasher.needsRehash.mockReturnValue(answer);

      expect(needsRehash(hasher, scryptHash)).toBe(answer);
      expect(passwordHasher.needsRehash).toHaveBeenCalledWith(scryptHash);
    });
  });
});
