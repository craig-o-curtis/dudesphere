import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { type EntityManager, IsNull, LessThanOrEqual, Not, Repository } from "typeorm";

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
   * Saves a new token, then clears out the rows nothing needs any more.
   * That is the only housekeeping the table gets: there is no scheduler, and
   * each sign-in and each refresh passes through here.
   *
   * Two kinds of row go:
   *
   * 1. Every row of any session that has reached its end by `now`, whoever
   *    it belongs to.
   * 2. In the session this token belongs to: the tokens that were spent and
   *    whose own time ran out. A session gains a row with every refresh, so
   *    without this a busy one would keep 30 days of them. With it, it keeps
   *    about 7.
   */
  async save(token: NewRefreshToken, now: string): Promise<void> {
    await this.refreshTokensRepository.insert(token);
    await this.refreshTokensRepository.delete({ familyExpiresAt: LessThanOrEqual(now) });
    await this.trimSpentTokens(token.familyId, now);
  }

  // Deletes the spent, expired tokens of one session.
  //
  // Only this session, not the whole table. The index on (familyId, revoked)
  // finds its rows at once, where a search for every spent row in the table
  // would have to read all of it on each sign-in. A session that has stopped
  // refreshing is not growing, and goes whole at its end.
  //
  // Only rows that are not revoked. A session counts as ended when any of
  // its rows is revoked. A refresh that is in flight at the moment of a
  // sign-out can save one more row a moment after the others were marked,
  // and that late row is not marked. The older, revoked rows are what keep
  // it dead. Deleting them would bring the session back to life, so they
  // stay until the session's end.
  //
  // What this gives up: a spent token is recognised as "used twice" only
  // while its row exists. One that comes back after its row is gone is
  // still refused, as unknown, but it no longer ends the session. A stolen
  // token is used in minutes, not after a week, so that is a small price.
  private async trimSpentTokens(familyId: string, now: string): Promise<void> {
    await this.refreshTokensRepository.delete({
      familyId,
      revoked: false,
      usedAt: Not(IsNull()),
      expiresAt: LessThanOrEqual(now),
    });
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
   * minutes. save() keeps a session to about a week of rows in any case.
   */
  async isSessionLive(familyId: string, now: string): Promise<boolean> {
    const [session] = (await this.refreshTokensRepository.query(SESSION_STATE, [
      familyId,
      now,
    ])) as [{ going: boolean; revoked: boolean }];

    return session.going && !session.revoked;
  }
}
