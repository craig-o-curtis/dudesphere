import { Injectable } from "@nestjs/common";
import * as bcrypt from "bcrypt";

import { HashingProvider } from "./hashing.provider.js";

// The cost. bcrypt runs 2^12 rounds, and each step up doubles the time one
// hash takes. 12 is about a quarter of a second on current hardware: unnoticed
// at login, slow for someone guessing passwords against a stolen table.
// This is the rounds / exponent bcrypt uses 2^12, which is 4,096 rounds, it is
// essentially the exponent
const COST = 12;

const MAX_PASSWORD_BYTES = 72;

@Injectable()
export class BcryptProvider implements HashingProvider {
  // Made once, when Nest builds this provider at startup. comparePassword()
  // checks against it when there is no real hash, so that path costs the same
  // as a real compare. Made here and not on first use, so the first login for
  // an unknown account does not also pay for a hash.
  private readonly dummyHash = bcrypt.hash("no-account-has-this-password", COST);

  // bcrypt.hash makes a random salt and stores it inside the returned string,
  // along with the cost. That is why comparePassword() needs nothing but the
  // hash.
  async hashPassword(plain: string): Promise<string> {
    // bcrypt reads the first 72 bytes and ignores the rest. The sign-up DTO
    // already rejects longer input; this catches a caller that skips the DTO,
    // such as the seed, before it stores a hash of only part of a password.
    if (Buffer.byteLength(plain) > MAX_PASSWORD_BYTES) {
      throw new RangeError(`A password can be at most ${MAX_PASSWORD_BYTES} bytes for bcrypt`);
    }
    return bcrypt.hash(plain, COST);
  }

  async comparePassword(plain: string, hash: string | undefined): Promise<boolean> {
    if (hash === undefined) {
      // There is no stored hash, so the answer is already false. The compare
      // still runs, against the dummy hash, so this path takes as long as a
      // real one. If it returned at once, an unknown account would answer
      // faster than a known one, and the timing would show which accounts
      // exist.
      await bcrypt.compare(plain, await this.dummyHash);
      return false;
    }

    // A stored value that is not a bcrypt hash, such as a password saved as
    // plain text before hashing was added, gives false here. It never matches.
    const matches = await bcrypt.compare(plain, hash);

    // bcrypt reads the first 72 bytes of `plain` and ignores the rest, so a
    // longer input can match the hash of its first 72 bytes. hashPassword()
    // never stores a password that long, so a longer one is always wrong. The
    // compare above still runs first, so this answer takes the same time.
    return matches && Buffer.byteLength(plain) <= MAX_PASSWORD_BYTES;
  }
}
