import { Inject, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, type EntityManager, IsNull, Repository } from "typeorm";

import { User } from "./user.entity.js";

/** A member, and the stored hash of their password. For signing in only. */
export interface UserCredentials {
  user: User;
  passwordHash: string;
}

// Every column but the password hash. What leaves this class carries no hash,
// except from findCredentials, which hands it over apart from the user.
const WITHOUT_PASSWORD = {
  id: true,
  username: true,
  email: true,
  role: true,
  passwordChangedAt: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

/**
 * The user queries that signing in needs, as in the NestJS authentication
 * docs: find a member by id, find the hash a password is checked against,
 * and store a new hash. UsersService keeps everything else.
 *
 * Soft-deleted members are never found, so a closed account cannot sign in
 * and its tokens stop working.
 */
@Injectable()
export class UsersRepository {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    // @Inject names the token outright, because `pnpm seed:run` builds the
    // whole app through tsx, which emits no constructor types.
    @Inject(DataSource) private readonly dataSource: DataSource,
  ) {}

  /** The member, without the password hash, or null. */
  findById(id: number): Promise<User | null> {
    return this.users.findOne({ where: { id }, select: WITHOUT_PASSWORD });
  }

  /** The member with this username or email, without the password hash, or null. */
  findByIdentifier(identifier: string): Promise<User | null> {
    return this.users.findOne({ where: whereIdentifier(identifier), select: WITHOUT_PASSWORD });
  }

  /** For signing in and for password reset links only. */
  async findCredentials(identifier: string): Promise<UserCredentials | null> {
    const found = await this.users.findOne({ where: whereIdentifier(identifier) });
    if (!found) {
      return null;
    }
    const { password: passwordHash, ...user } = found;
    return { user: user as User, passwordHash };
  }

  /**
   * Stores the hash of a new password, and stamps `passwordChangedAt`, so
   * access tokens signed before that moment stop working (see JwtAuth).
   * Pass `manager` to write inside the caller's transaction.
   *
   * Resolves false when there is no such live member.
   */
  async updatePasswordHash(
    id: number,
    passwordHash: string,
    passwordChangedAt: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    const users = manager?.getRepository(User) ?? this.users;
    const { affected } = await users.update(
      { id, deletedAt: IsNull() },
      { password: passwordHash, passwordChangedAt },
    );
    return affected === 1;
  }

  /**
   * Swaps a hash for a newer hash of the same password, as sign-in does when
   * the old one is bcrypt. The password did not change, so no token ends.
   *
   * Written only while `oldHash` is still the stored hash. A password change
   * that lands between the sign-in's check and this write wins, and this
   * write does nothing: otherwise it would put the old password back.
   *
   * Resolves false when nothing was written.
   */
  async replacePasswordHash(id: number, oldHash: string, newHash: string): Promise<boolean> {
    const { affected } = await this.users.update(
      { id, password: oldHash, deletedAt: IsNull() },
      { password: newHash },
    );
    return affected === 1;
  }

  /**
   * For sign-in, straight after the sign-in has started. True when the
   * member's account is still open and their password has not changed since
   * `passwordChangedAt`, the value read when the password was checked.
   *
   * It closes a gap of about a tenth of a second. Checking a password takes
   * that long, on purpose. A password change that commits during it ends the
   * member's sign-ins before this sign-in has started its own, so the new one
   * would outlive the change. TokensController asks here after it has the
   * new sign-in, and ends it when the answer is no.
   *
   * It compares `passwordChangedAt`, not the hash. A sign-in that upgrades a
   * bcrypt hash changes the hash but not the password, and must not count as
   * a change.
   *
   * The row is read with a share lock (FOR SHARE). A password change holds a
   * lock on the row from its UPDATE until it commits, so this read waits for
   * one that is in flight and then sees the new stamp. A lock needs a
   * transaction, which is the only reason for one here.
   */
  signInStillValid(id: number, passwordChangedAt: string | null): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, {
        where: { id },
        select: { id: true, passwordChangedAt: true },
        lock: { mode: "pessimistic_read" },
      });
      return user !== null && user.passwordChangedAt === passwordChangedAt;
    });
  }
}

// The one place that decides whether an identifier is a username or an
// email. An "@" means an email. CreateUserDto and a CHECK on the table both
// keep "@" out of usernames, so one identifier can never match two accounts.
// Both columns are citext, so either lookup ignores case.
function whereIdentifier(identifier: string) {
  return identifier.includes("@") ? { email: identifier } : { username: identifier };
}
