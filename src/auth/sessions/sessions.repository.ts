import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { type EntityManager, IsNull, LessThanOrEqual, MoreThan, Repository } from "typeorm";

import { RefreshToken } from "./refresh-token.entity.js";
import { Session } from "./session.entity.js";

/** What a new session row needs. The rest of the columns have defaults. */
export type NewSession = Pick<Session, "id" | "userId" | "expiresAt">;

/** What a new refresh token row needs. The rest of the columns have defaults. */
export type NewRefreshToken = Pick<RefreshToken, "id" | "sessionId" | "expiresAt">;

/** What findToken returns: the token's row, and its session's row. */
export interface FoundToken {
  token: RefreshToken;
  session: Session;
  /** False when the session's member has closed their account, or it is gone. */
  accountOpen: boolean;
}

/**
 * Reads and writes the session and refresh_token tables, and decides
 * nothing. SessionsService holds the rules: when a token may be swapped, and
 * what counts as theft.
 *
 * Each method that settles "who got there first" is a single statement, so
 * the answer holds with any number of copies of the app running.
 *
 * Every time these methods write or compare comes in as an argument, from
 * the caller's clock. No query here reads the database's clock, so the two
 * can never disagree. The one exception is `createdAt`, which Postgres
 * stamps itself and nothing reads.
 *
 * Rows outlive their session. A session that is over stays as a record, with
 * its tokens, until deleteSessionsEndedBy removes it. Until then nothing here
 * rewrites it, which is why the two revoke methods only touch sessions that
 * are still going.
 */
@Injectable()
export class SessionsRepository {
  constructor(
    @InjectRepository(Session)
    private readonly sessions: Repository<Session>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokens: Repository<RefreshToken>,
  ) {}

  /** Saves the row for a new session. */
  async createSession(session: NewSession): Promise<void> {
    await this.sessions.insert(session);
  }

  /** Saves the row for a new refresh token, in a session that exists. */
  async saveToken(token: NewRefreshToken): Promise<void> {
    await this.refreshTokens.insert(token);
  }

  /**
   * Deletes every session that ended at or before `cutoff`, whoever it
   * belongs to. Its refresh tokens go with it: the foreign key cascades.
   *
   * This is the only thing that deletes a row from either table.
   * SessionsService passes the time 180 days ago, so a session's rows
   * outlive it by 180 days.
   */
  async deleteSessionsEndedBy(cutoff: string): Promise<void> {
    await this.sessions.delete({ expiresAt: LessThanOrEqual(cutoff) });
  }

  /**
   * The row for a token's hash, with its session, or null when no row has
   * that hash. Used and expired tokens, and tokens of sessions that are
   * over, come back too: the caller tells them apart.
   *
   * One query with two joins. The second, to the user, is only there to
   * answer `accountOpen`. TypeORM leaves a soft-deleted user out of a join,
   * so the session comes back with no user when the account is closed.
   */
  async findToken(id: string): Promise<FoundToken | null> {
    const [token] = await this.refreshTokens.find({
      where: { id },
      relations: { session: { user: true } },
    });
    if (!token) {
      return null;
    }

    const { session } = token;
    // `user` is typed as always present, but the join leaves it null for a
    // closed account.
    const user = session.user as Session["user"] | null;
    return { token, session, accountOpen: user !== null };
  }

  /**
   * Marks a token used, if it is not used already. True when this call did
   * it.
   *
   * One conditional UPDATE. Of two requests that arrive together with the
   * same token, exactly one gets true. The other is a second use.
   */
  async markTokenUsed(id: string, at: string): Promise<boolean> {
    const result = await this.refreshTokens.update({ id, usedAt: IsNull() }, { usedAt: at });
    return result.affected === 1;
  }

  /**
   * Ends one session, at `now`.
   *
   * Only a session that is still going: one that was already ended keeps
   * the time it was first ended, and one past its end is left as the record
   * of a session that ran out by itself.
   */
  async revokeSession(sessionId: string, now: string): Promise<void> {
    await this.sessions.update(
      { id: sessionId, revokedAt: IsNull(), expiresAt: MoreThan(now) },
      { revokedAt: now },
    );
  }

  /**
   * Ends every session the member has at `now`. A session started
   * afterwards is not affected, so the member can log in again straight
   * away.
   *
   * Only sessions that are still going, for the same reasons as
   * revokeSession.
   *
   * Pass the caller's `manager` to make this part of its transaction. A
   * password change does: the new password and the end of the old sessions
   * then succeed or fail together, and never one without the other.
   */
  async revokeSessionsOfUser(userId: number, now: string, manager?: EntityManager): Promise<void> {
    const sessions = manager?.getRepository(Session) ?? this.sessions;
    await sessions.update(
      { userId, revokedAt: IsNull(), expiresAt: MoreThan(now) },
      { revokedAt: now },
    );
  }

  /**
   * Whether a session is still going at `now`: its row exists, nobody ended
   * it, and it has not reached its end.
   *
   * For JwtAuthGuard, on every logged-in request. One lookup by primary key.
   */
  isSessionLive(sessionId: string, now: string): Promise<boolean> {
    return this.sessions.existsBy({
      id: sessionId,
      revokedAt: IsNull(),
      expiresAt: MoreThan(now),
    });
  }
}
