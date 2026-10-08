import { Injectable } from "@nestjs/common";
import * as bcrypt from "bcrypt";

import { HashingProvider } from "./hashing.provider.js";

// The cost. bcrypt runs 2^12 rounds, and each step up doubles the time one
// hash takes. 12 is about a quarter of a second on current hardware: unnoticed
// at login, slow for someone guessing passwords against a stolen table.
const ROUNDS = 12;

@Injectable()
export class BcryptProvider implements HashingProvider {
  // Made on first use and then reused. compare() checks against it when there
  // is no real hash, so that path costs the same as a real compare.
  private dummyHash?: Promise<string>;

  // bcrypt.hash makes a random salt and stores it inside the returned string,
  // along with the cost. That is why compare() needs nothing but the hash.
  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, ROUNDS);
  }

  async compare(plain: string, hash: string | undefined): Promise<boolean> {
    if (hash === undefined) {
      this.dummyHash ??= bcrypt.hash("no-account-has-this-password", ROUNDS);
      await bcrypt.compare(plain, await this.dummyHash);
      return false;
    }

    // A stored value that is not a bcrypt hash, such as a password saved as
    // plain text before hashing was added, gives false here. It never matches.
    return bcrypt.compare(plain, hash);
  }
}
