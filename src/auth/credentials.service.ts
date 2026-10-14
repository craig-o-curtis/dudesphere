import { PasswordHasher } from "@nestjs/authentication";
import { Inject, Injectable } from "@nestjs/common";

import { needsRehash, verifyPassword } from "../users/password-hashes.js";
import type { User } from "../users/user.entity.js";
import { UsersRepository } from "../users/users.repository.js";

/**
 * Checks a password at sign-in. The docs' CredentialsService, with two
 * changes: it takes a username or an email, and it also accepts the bcrypt
 * hashes stored before PasswordHasher. See src/users/password-hashes.ts.
 *
 * Sign-up is not here. It is UsersService.createUser, which also creates the
 * member's profile.
 */
@Injectable()
export class CredentialsService {
  constructor(
    // @Inject names each token outright, because `pnpm seed:run` builds the
    // whole app through tsx, which emits no constructor types.
    @Inject(UsersRepository) private readonly usersRepository: UsersRepository,
    @Inject(PasswordHasher) private readonly passwordHasher: PasswordHasher,
  ) {}

  /** The member, or `null` when the identifier or the password is wrong. */
  async verify(identifier: string, password: string): Promise<User | null> {
    const found = await this.usersRepository.findCredentials(identifier);
    // With no account, verify checks a dummy hash, so the response time does
    // not reveal which usernames and emails are registered.
    const valid = await verifyPassword(this.passwordHasher, password, found?.passwordHash);
    if (!valid || !found) {
      return null;
    }
    // The hash is bcrypt, or the cost settings changed since it was stored:
    // upgrade it now, while we have the password. The password itself is the
    // same, so no token is ended. The write is skipped if the password was
    // changed in the meantime. See UsersRepository.replacePasswordHash.
    if (needsRehash(this.passwordHasher, found.passwordHash)) {
      await this.usersRepository.replacePasswordHash(
        found.user.id,
        found.passwordHash,
        await this.passwordHasher.hash(password),
      );
    }
    return found.user;
  }

  /**
   * Whether a sign-in that `verify` just let through is still sound, now that
   * it has started: the account is open, and the password has not changed
   * since `verify` read it. See UsersRepository.signInStillValid for the gap
   * this closes.
   */
  stillValid(user: User): Promise<boolean> {
    return this.usersRepository.signInStillValid(user.id, user.passwordChangedAt);
  }
}
