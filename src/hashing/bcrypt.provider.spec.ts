import { BcryptProvider } from "./bcrypt.provider.js";

// These run real bcrypt at the real cost, so the hash is made once and shared.
describe("BcryptProvider", () => {
  const provider = new BcryptProvider();
  const password = "the-dude-abides";
  let hash: string;

  beforeAll(async () => {
    hash = await provider.hashPassword(password);
  });

  it("returns a bcrypt hash, not the password", () => {
    expect(hash).not.toContain(password);
    expect(hash).toMatch(/^\$2[aby]\$12\$.{53}$/);
  });

  it("gives a different hash for the same password, because each has its own salt", async () => {
    const second = await provider.hashPassword(password);

    expect(second).not.toBe(hash);
    expect(await provider.comparePassword(password, second)).toBe(true);
  });

  it("matches the password the hash was made from", async () => {
    expect(await provider.comparePassword(password, hash)).toBe(true);
  });

  it("does not match a different password", async () => {
    expect(await provider.comparePassword("the-dude-abide", hash)).toBe(false);
  });

  it("answers false when there is no hash to compare against", async () => {
    expect(await provider.comparePassword(password, undefined)).toBe(false);
  });

  it("hashes a password of exactly 72 bytes and refuses one of 73", async () => {
    const atLimit = "a".repeat(72);

    expect(await provider.comparePassword(atLimit, await provider.hashPassword(atLimit))).toBe(
      true,
    );
    await expect(provider.hashPassword("a".repeat(73))).rejects.toBeInstanceOf(RangeError);
  });

  // A row saved before hashing was added holds the password itself.
  it("answers false, without throwing, for a stored value that is not a hash", async () => {
    expect(await provider.comparePassword(password, password)).toBe(false);
  });

  // bcrypt alone answers true here: it reads 72 bytes and ignores the "b".
  it("does not match a password over 72 bytes whose first 72 bytes are right", async () => {
    const atLimit = "a".repeat(72);
    const stored = await provider.hashPassword(atLimit);

    expect(await provider.comparePassword(`${atLimit}b`, stored)).toBe(false);
  });
});
