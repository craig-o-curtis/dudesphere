import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, LessThanOrEqual, Repository } from "typeorm";

import { RefreshToken } from "./refresh-token.entity.js";

/** What a new row needs. The rest of the columns have defaults. */
export type NewRefreshToken = Pick<
  RefreshToken,
  "id" | "familyId" | "userId" | "expiresAt" | "familyExpiresAt"
>;

/**
 * Reads and writes the refresh_token table, and decides nothing.
 * TokenService holds the rules: when a token may be swapped, and what counts
 * as theft.
 *
 * The methods follow the refresh token store in the NestJS authentication
 * docs. Each one that settles "who got there first" is a single statement,
 * so the answer holds with any number of copies of the app running.
 *
 * Every time comes in as an argument, from the caller's clock. Nothing here
 * reads the database's clock, so the two can never disagree.
 */
@Injectable()
export class RefreshTokensService {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokensRepository: Repository<RefreshToken>,
  ) {}

  /**
   * Saves a new token, then clears out the rows of every session that has
   * run out by `now`. That is the only housekeeping the table gets: there is
   * no scheduler, and each sign-in and each refresh passes through here.
   */
  async save(token: NewRefreshToken, now: string): Promise<void> {
    await this.refreshTokensRepository.insert(token);
    await this.refreshTokensRepository.delete({ familyExpiresAt: LessThanOrEqual(now) });
  }

  /**
   * The row for a token's hash, or null. Used, expired and revoked rows come
   * back too: the caller has to tell them apart.
   */
  find(id: string): Promise<RefreshToken | null> {
    return this.refreshTokensRepository.findOneBy({ id });
  }

  /**
   * Marks a token used, if it is not used already. True when this call did
   * it.
   *
   * One conditional UPDATE. Of two requests that arrive together with the
   * same token, exactly one gets true. The other is a second use.
   */
  async markUsed(id: string, at: string): Promise<boolean> {
    const result = await this.refreshTokensRepository.update(
      { id, usedAt: IsNull() },
      { usedAt: at },
    );
    return result.affected === 1;
  }

  /** Ends one session: every token of the family, spent or not. */
  async revokeFamily(familyId: string): Promise<void> {
    await this.refreshTokensRepository.update({ familyId }, { revoked: true });
  }

  /** Whether the session a token belongs to has been ended. */
  isFamilyRevoked(familyId: string): Promise<boolean> {
    return this.refreshTokensRepository.existsBy({ familyId, revoked: true });
  }

  /**
   * Ends every session the member has now. A session started afterwards is
   * not affected, so the member can sign in again straight away.
   */
  async revokeAllForUser(userId: number): Promise<void> {
    await this.refreshTokensRepository.update({ userId }, { revoked: true });
  }

  /**
   * For JwtAuthGuard, on every signed-in request. Whether the session an
   * access token belongs to is still going at `now`.
   *
   * Live means three things: the session has rows, it has not passed its
   * end, and none of its rows is revoked. One query, which counts the rows
   * that are not past the end and asks whether any is revoked.
   */
  async isSessionLive(familyId: string, now: string): Promise<boolean> {
    const session = await this.refreshTokensRepository
      .createQueryBuilder("token")
      .select("COUNT(*)", "tokens")
      .addSelect("COALESCE(BOOL_OR(token.revoked), false)", "revoked")
      .where("token.familyId = :familyId", { familyId })
      .andWhere("token.familyExpiresAt > :now", { now })
      .getRawOne<{ tokens: string; revoked: boolean }>();

    return session !== undefined && Number(session.tokens) > 0 && !session.revoked;
  }
}
