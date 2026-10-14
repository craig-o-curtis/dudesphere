import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";

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
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

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
   *
   * Resolves false when there is no such live member.
   */
  async updatePasswordHash(
    id: number,
    passwordHash: string,
    passwordChangedAt: string,
  ): Promise<boolean> {
    const { affected } = await this.users.update(
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
}

// The one place that decides whether an identifier is a username or an
// email. An "@" means an email. CreateUserDto and a CHECK on the table both
// keep "@" out of usernames, so one identifier can never match two accounts.
// Both columns are citext, so either lookup ignores case.
function whereIdentifier(identifier: string) {
  return identifier.includes("@") ? { email: identifier } : { username: identifier };
}
