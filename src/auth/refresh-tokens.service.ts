import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { type EntityManager, IsNull, LessThanOrEqual, Repository } from "typeorm";

import { RefreshToken } from "./refresh-token.entity.js";

/** What a new row needs. The rest of the columns have defaults. */
export type NewRefreshToken = Pick<
  RefreshToken,
  "id" | "familyId" | "userId" | "expiresAt" | "familyExpiresAt"
>;

// For isSessionLive. Every row of a family carries the same familyExpiresAt,
// so one row that is not past it means the session is still going.
const SESSION_STATE = `
  SELECT
    EXISTS (
      SELECT 1 FROM "refresh_token" WHERE "familyId" = $1 AND "familyExpiresAt" > $2
    ) AS "going",
    EXISTS (
      SELECT 1 FROM "refresh_token" WHERE "familyId" = $1 AND "revoked" = true
    ) AS "revoked"
`;

/**
 * Reads and writes the refresh_token table, and decides nothing.
 * TokenService holds the rules: when a token may be swapped, and what counts
 * as theft.
 *
 * The methods follow the refresh token store in the NestJS authentication
 * docs. Each one that settles "who got there first" is a single statement,
 * so the answer holds with any number of copies of the app running.
 *
 * Every time these methods write or compare comes in as an argument, from
 * the caller's clock. No query here reads the database's clock, so the two
 * can never disagree. The one exception is `createdAt`, which Postgres
 * stamps itself and nothing reads.
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
   *
   * Pass the caller's `manager` to make this part of its transaction. A
   * password change does: the new password and the end of the old sessions
   * then succeed or fail together, and never one without the other.
   */
  async revokeAllForUser(userId: number, manager?: EntityManager): Promise<void> {
    const repository = manager?.getRepository(RefreshToken) ?? this.refreshTokensRepository;
    await repository.update({ userId }, { revoked: true });
  }

  /**
   * For JwtAuthGuard, on every signed-in request. Whether the session an
   * access token belongs to is still going at `now`.
   *
   * Live means three things: the session has rows, it has not passed its
   * end, and none of its rows is revoked.
   *
   * One statement with two EXISTS probes. A session gains a row with every
   * refresh, so counting them would read hundreds of rows on every request.
   * The index on (familyId, revoked) narrows both probes to the one session.
   * The "revoked" probe is answered from the index alone. The other reads
   * one row of a session that is still going, and stops there. Only for a
   * session past its end and not yet cleared out does it read them all, and
   * an access token cannot outlive its session by more than its own 15
   * minutes.
   */
  async isSessionLive(familyId: string, now: string): Promise<boolean> {
    const [session] = (await this.refreshTokensRepository.query(SESSION_STATE, [
      familyId,
      now,
    ])) as [{ going: boolean; revoked: boolean }];

    return session.going && !session.revoked;
  }
}
