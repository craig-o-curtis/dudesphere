import { createHash, randomBytes } from "node:crypto";

// The random tokens this app hands out and takes back once: the token in a
// password reset link, and a refresh token. Both are made, recognised and
// hashed here, so the two cannot drift apart.

// 32 random bytes, so 2^256 possible tokens. Nobody guesses one.
const TOKEN_BYTES = 32;

// 32 bytes written as base64url: 43 characters from this set, with no padding.
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

/**
 * A new token: 32 random bytes, written as 43 URL-safe characters. It carries
 * no data and no signature. It means something only because a hash of it is
 * in a table.
 */
export function newOneTimeToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * Whether a value has the shape of a token made here. A value that does not
 * cannot match any row, so the caller can refuse it without asking the
 * database.
 */
export function isOneTimeToken(value: string): boolean {
  return TOKEN_SHAPE.test(value);
}

/**
 * The hash a token is stored and looked up by. The token itself is never
 * stored, so someone who reads the table cannot use what they find.
 *
 * SHA-256, not bcrypt. bcrypt is slow on purpose, to make guessing a short
 * password costly. A token is 32 random bytes: there is nothing to guess, so
 * a fast hash is enough, and a fast hash can be looked up by an index.
 */
export function hashOf(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
