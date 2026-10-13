import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { type EntityManager, IsNull, LessThanOrEqual, MoreThan, Repository } from "typeorm";

import { RefreshToken } from "./refresh-token.entity.js";

/** What a new row needs. The rest of the columns have defaults. */
export type NewRefreshToken = Pick<
  RefreshToken,
  "id" | "sessionId" | "userId" | "expiresAt" | "sessionExpiresAt"
>;

// For isSessionLive. Every row of a session carries the same sessionExpiresAt,
// so one row that is not past it means the session is still going.

// this is a direct snapshot at this moment in type - if concurrent
// exists tops at the first mathcing row, is on the hot path, is about concurrencty
// therefore is just doing a -
const SESSION_STATE = `
  SELECT
    EXISTS (
      SELECT 1 FROM "refresh_token" WHERE "sessionId" = $1 AND "sessionExpiresAt" > $2
    ) AS "going",
    EXISTS (
      SELECT 1 FROM "refresh_token" WHERE "sessionId" = $1 AND "revoked" = true
    ) AS "revoked"
`;

/**
 * Reads and writes the refresh_token table, and decides nothing.
 * SessionsService holds the rules: when a token may be swapped, and what counts
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
 *
 * Rows outlive their session. A dead row is a tombstone: a record that the
 * token existed and how it ended. save() deletes a session's rows only once
 * the session ended long enough ago. Until then nothing here rewrites a
 * session that is past its end, which is why the two revoke methods mark
 * only the sessions that are still going.
 */
@Injectable()
export class RefreshTokensService {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokensRepository: Repository<RefreshToken>,
  ) {}

  /**
   * Saves a new token, then deletes the rows that are old enough to go.
   * That is the only housekeeping the table gets: there is no scheduler, and
   * each login and each refresh passes through here.
   *
   * What goes: every row of any session that ended at or before
   * `purgeBefore`, whoever it belongs to. SessionsService passes the time 180
   * days ago, so a session's rows outlive it by 180 days and then go
   * together.
   *
   * Nothing else is deleted. A spent token stays for as long as its session
   * does, so one that comes back is always recognised as used twice. A
   * revoked row stays too: a session counts as ended when any of its rows is
   * revoked, and a refresh in flight at the moment of a logout can save
   * one more row a moment after the others were marked. The older, revoked
   * rows are what keep that session ended.
   */

  // is LessThanOr
  async save(token: NewRefreshToken, purgeBefore: string): Promise<void> {
    await this.refreshTokensRepository.insert(token);
    await this.refreshTokensRepository.delete({ sessionExpiresAt: LessThanOrEqual(purgeBefore) });
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

  /**
   * Ends one session: every one of its tokens, spent or not.
   *
   * Only a session that is still going at `now`. One past its end is over
   * already, and its rows are left as they are, as the record of how it
   * ended.
   */
  async revokeSession(sessionId: string, now: string): Promise<void> {
    await this.refreshTokensRepository.update(
      { sessionId, sessionExpiresAt: MoreThan(now) },
      { revoked: true },
    );
  }

  /** Whether the session a token belongs to has been ended. */
  isSessionRevoked(sessionId: string): Promise<boolean> {
    return this.refreshTokensRepository.existsBy({ sessionId, revoked: true });
  }

  /**
   * Ends every session the member has now. A session started afterwards is
   * not affected, so the member can log in again straight away.
   *
   * "Has now" means still going at `now`. The member's older sessions, kept
   * as a record, are not touched. Marking them would say they were ended on
   * purpose when they ran out by themselves, and would rewrite months of
   * rows on every password change.
   *
   * Pass the caller's `manager` to make this part of its transaction. A
   * password change does: the new password and the end of the old sessions
   * then succeed or fail together, and never one without the other.
   */
  async revokeAllForUser(userId: number, now: string, manager?: EntityManager): Promise<void> {
    const repository = manager?.getRepository(RefreshToken) ?? this.refreshTokensRepository;
    await repository.update({ userId, sessionExpiresAt: MoreThan(now) }, { revoked: true });
  }

  /**
   * For JwtAuthGuard, on every signed-in request. Whether the session an
   * access token belongs to is still going at `now`.
   *
   * Live means three things: the session has rows, it has not passed its
   * end, and none of its rows is revoked.
   *
   * One statement with two EXISTS probes. A session gains a row with every
   * refresh and keeps them all, so counting them would read every one of
   * them on every request. The index on (sessionId, revoked) narrows both
   * probes to the one session. The "revoked" probe is answered from the
   * index alone. The other reads one row of a session that is still going,
   * and stops there. Only for a session past its end does it read them all,
   * and an access token cannot outlive its session by more than its own 15
   * minutes.
   */
  async isSessionLive(sessionId: string, now: string): Promise<boolean> {
    const [session] = (await this.refreshTokensRepository.query(SESSION_STATE, [
      sessionId,
      now,
    ])) as [{ going: boolean; revoked: boolean }];

    return session.going && !session.revoked;
  }
}
