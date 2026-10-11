import { hashOf, isOneTimeToken, newOneTimeToken } from "./one-time-token.js";

describe("one-time tokens", () => {
  describe("newOneTimeToken", () => {
    it("is 43 URL-safe characters, which is 32 bytes", () => {
      expect(newOneTimeToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it("is different every time", () => {
      const tokens = new Set(Array.from({ length: 50 }, () => newOneTimeToken()));

      expect(tokens.size).toBe(50);
    });
  });

  describe("isOneTimeToken", () => {
    it("accepts a token made here", () => {
      expect(isOneTimeToken(newOneTimeToken())).toBe(true);
    });

    // None of these can match a row, so the caller refuses them without a
    // query. A JWT is among them: an access token sent as a refresh token.
    it.each([
      ["an empty string", ""],
      ["a token one character short", "a".repeat(42)],
      ["a token one character long", "a".repeat(44)],
      ["a character outside the set", `${"a".repeat(42)}+`],
      ["a JWT", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjF9.c2lnbmF0dXJl"],
    ])("refuses %s", (_what, value) => {
      expect(isOneTimeToken(value)).toBe(false);
    });
  });

  describe("hashOf", () => {
    it("is the SHA-256 of the token, as 64 hex characters", () => {
      // The well-known SHA-256 of "abc".
      expect(hashOf("abc")).toBe(
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      );
    });

    it("gives the same hash for the same token, and another for another", () => {
      const token = newOneTimeToken();

      expect(hashOf(token)).toBe(hashOf(token));
      expect(hashOf(token)).not.toBe(hashOf(newOneTimeToken()));
    });
  });
});
