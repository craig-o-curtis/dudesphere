import { BcryptProvider } from "./bcrypt.provider.js";

// These run real bcrypt at the real cost, so the hash is made once and shared.
describe("BcryptProvider", () => {
  const provider = new BcryptProvider();
  const password = "the-dude-abides";
  let hash: string;

  beforeAll(async () => {
    hash = await provider.hash(password);
  });

  it("returns a bcrypt hash, not the password", () => {
    expect(hash).not.toContain(password);
    expect(hash).toMatch(/^\$2[aby]\$12\$.{53}$/);
  });

  it("gives a different hash for the same password, because each has its own salt", async () => {
    const second = await provider.hash(password);

    expect(second).not.toBe(hash);
    expect(await provider.compare(password, second)).toBe(true);
  });

  it("matches the password the hash was made from", async () => {
    expect(await provider.compare(password, hash)).toBe(true);
  });

  it("does not match a different password", async () => {
    expect(await provider.compare("the-dude-abide", hash)).toBe(false);
  });

  it("answers false when there is no hash to compare against", async () => {
    expect(await provider.compare(password, undefined)).toBe(false);
  });

  // A row saved before hashing was added holds the password itself.
  it("answers false, without throwing, for a stored value that is not a hash", async () => {
    expect(await provider.compare(password, password)).toBe(false);
  });
});
