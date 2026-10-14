import type { PasswordHasher } from "@nestjs/authentication";
import * as bcrypt from "bcrypt";

// Passwords are hashed with PasswordHasher from @nestjs/authentication, which
// uses scrypt. Before it, they were hashed with bcrypt, and members who have
// not signed in since still have a bcrypt hash. These two functions let both
// kinds work: a bcrypt hash is checked with bcrypt, and replaced with a
// scrypt hash the next time its owner signs in (CredentialsService.verify).
//
// Once no row in `user` has a hash starting with "$2", this file and the
// bcrypt dependency can go.

// bcrypt reads 72 bytes of a password at most and ignores the rest. Every
// bcrypt hash here was made from a password of 72 bytes or fewer, so a
// longer one cannot be the right password, even when its first 72 bytes are.
const BCRYPT_MAX_PASSWORD_BYTES = 72;

/** Whether this hash was made by bcrypt, as every hash was before scrypt. */
export function isBcryptHash(hash: string): boolean {
  return /^\$2[aby]\$/.test(hash);
}

/**
 * Whether `password` matches the stored hash, of either kind.
 *
 * With no hash (an unknown account), PasswordHasher checks a dummy hash, so
 * an unknown account and a wrong password take about the same time. A member
 * whose hash is still bcrypt answers in bcrypt's time instead, which differs.
 * That tells an attacker only that the account exists and has not signed in
 * since the switch, and it stops once they do.
 */
export async function verifyPassword(
  passwordHasher: PasswordHasher,
  password: string,
  hash: string | null | undefined,
): Promise<boolean> {
  if (hash && isBcryptHash(hash)) {
    if (Buffer.byteLength(password) > BCRYPT_MAX_PASSWORD_BYTES) {
      return false;
    }
    // "$2y$" is the same algorithm as "$2b$" under another name, which the
    // bcrypt package does not read. Node's bcrypt always wrote "$2b$".
    return bcrypt.compare(
      password,
      hash.replace(/^\$2y\$/, () => "$2b$"),
    );
  }
  return passwordHasher.verify(password, hash);
}

/** Whether a stored hash should be replaced while the password is at hand. */
export function needsRehash(passwordHasher: PasswordHasher, hash: string): boolean {
  return isBcryptHash(hash) || passwordHasher.needsRehash(hash);
}
