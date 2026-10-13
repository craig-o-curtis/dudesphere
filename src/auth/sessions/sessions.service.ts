import { randomUUID } from "node:crypto";

import { Inject, Injectable, Logger } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { addUtc, isAfterUtc, minUtc, subtractUtc } from "@northguild/gmt";
import type { EntityManager } from "typeorm";

import { RefreshTokenInvalidException } from "../../shared/exceptions/refresh-token-invalid.exception.js";
import { jwtPayloadFor } from "../../shared/guards/auth-user.js";
import { orClockUnavailable, utcNowOrThrow } from "../../shared/utils/utc-clock.js";
import authConfig from "../config/auth.config.js";
import { hashOf, isOneTimeToken, newOneTimeToken } from "../one-time-token.js";
import type { Session } from "./session.entity.js";
import { SessionsRepository } from "./sessions.repository.js";

/**
 * What logging in, and refreshing, answer with. The names are OAuth's, and
 * the ones the NestJS docs use.
 */
export interface TokenPair {
  /** A signed JWT. Sent back as `Authorization: Bearer <accessToken>`. Short-lived. */
  accessToken: string;
  /** Random text, not a JWT. Swapped once for a new pair when the access token expires. */
  refreshToken: string;
  /** How long the access token lasts, in seconds, so a client knows when to refresh. */
  expiresIn: number;
}

/** The member a pair of tokens is for. */
interface TokenOwner {
  id: number;
  username: string;
}

/**
 * Everything the rest of the app does with a session goes through here:
 * start one at login, renew it, end it, and ask whether it is still going.
 *
 * A session is one login. It has one row in the session table, and that row
 * says when the session ends and whether it was ended on purpose.
 *
 * A member in a session holds two tokens, for two jobs:
 *
 * - The access token is a JWT that lasts 15 minutes. It goes with every
 *   request, and JwtAuthGuard checks it. It carries the session's id.
 * - The refresh token is random text that lasts 7 days. It goes to two
 *   routes only: one swaps it for a new pair, and one logs out. The
 *   database keeps a hash of it, in a row that points at the session.
 *
 * A refresh token works once. Swapping it marks it used and hands out a
 * successor in the same session. If a used token comes back, two parties
 * hold it, a thief and the member, and nothing says which is which. So the
 * session is ended and both log in again.
 *
 * A session's row and its tokens' rows are kept for 180 days after it ends,
 * as a record, and are deleted then. A session past its end is over: its
 * tokens are refused and its rows are never changed again.
 *
 * This class holds the rules. SessionsRepository holds the queries.
 *
 * The design starts from the refresh tokens in the NestJS authentication
 * docs. Two things differ. The docs call the methods issue, refresh, revoke
 * and revokeAll; here they are named for what happens to the session. And
 * the docs have no session table: a session there is the token rows that
 * share a `familyId`, a "token family".
 */
@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    // @Inject names every token outright. `pnpm seed:run` and `pnpm dev:token`
    // start the whole app through tsx, which does not emit the constructor
    // types Nest otherwise reads. With @Inject on some parameters and not
    // others, Nest refuses to start there.
    @Inject(JwtService)
    private readonly jwtService: JwtService,
    @Inject(SessionsRepository)
    private readonly sessionsRepository: SessionsRepository,
    // authConfig.KEY is not a secret. It is the name Nest gives the "auth"
    // config object, used here to ask for it.
    @Inject(authConfig.KEY) private readonly auth: ConfigType<typeof authConfig>,
  ) {}

  /**
   * At login, once the password has been checked: starts a session and
   * returns its first pair of tokens.
   */
  async start(user: TokenOwner): Promise<TokenPair> {
    const now = this.now();
    const session = {
      id: randomUUID(),
      userId: user.id,
      // Fixed here, and no refresh moves it.
      expiresAt: this.after(now, this.auth.sessionExpiresIn),
    };
    await this.sessionsRepository.createSession(session);

    return this.pair(user, session, now);
  }

  /**
   * Swaps a refresh token for a new pair in the same session. The token is
   * spent: it cannot be swapped again.
   *
   * Throws RefreshTokenInvalidException, a 401, for a token that is unknown,
   * expired, already used, or whose session or member is gone.
   */
  async refresh(refreshToken: string): Promise<TokenPair> {
    // 1. Not the shape of a token made here, so it cannot match a row. An
    //    access token sent by mistake ends here.
    if (!isOneTimeToken(refreshToken)) {
      throw new RefreshTokenInvalidException();
    }

    const now = this.now();
    const found = await this.sessionsRepository.findToken(hashOf(refreshToken));

    // 2. No such token, or its session is over. Either the session reached
    //    its end, or it was ended: by a logout, a password change, or an
    //    earlier theft. The rows are still there, kept as a record.
    if (!found || this.isOver(found.session, now)) {
      throw new RefreshTokenInvalidException();
    }
    const { token, session, member } = found;

    // 3. Used before. Two parties hold this token, so the session ends.
    if (token.usedAt) {
      throw await this.endStolenSession(session, now);
    }

    // 4. Unused, and past its time. The member was away too long. This is not
    //    theft, so the session is left as it is.
    if (!isAfterUtc(token.expiresAt, now)) {
      throw new RefreshTokenInvalidException();
    }

    // 5. The account was closed since. Closing an account ends its sessions,
    //    so step 2 should already have refused this. If one slipped through,
    //    it ends here.
    if (!member) {
      await this.sessionsRepository.revokeSession(session.id, now);
      throw new RefreshTokenInvalidException();
    }

    // 6. Hand out the successor, then spend this token. In that order: if the
    //    app stops between the two, the member still holds a token that
    //    works, and can try again.
    const pair = await this.pair(member, session, now);

    // The mark is one conditional statement. If it changed nothing, another
    // request spent this same token in the moment since step 3. That is a
    // second use like any other, and the successor just saved goes with the
    // session.
    const spentByThisCall = await this.sessionsRepository.markTokenUsed(token.id, now);
    if (!spentByThisCall) {
      throw await this.endStolenSession(session, now);
    }

    return pair;
  }

  /**
   * Logs out the device that holds this refresh token: ends its session,
   * and no other. A spent token of the session works too, so a client that
   * kept an old one can still log out.
   *
   * An unknown or malformed token does nothing and raises nothing. The route
   * answers the same either way, so it cannot be used to find out whether a
   * token is real (RFC 7009, section 2.2). The same goes for a token of a
   * session that is already over: there is nothing left to log out of, and
   * its row stays as it is.
   */
  async end(refreshToken: string): Promise<void> {
    if (!isOneTimeToken(refreshToken)) {
      return;
    }
    const found = await this.sessionsRepository.findToken(hashOf(refreshToken));
    if (found) {
      await this.sessionsRepository.revokeSession(found.session.id, this.now());
    }
  }

  /**
   * Logs the member out on every device: ends every session they have now.
   * A session started afterwards is not affected, so they can log in again
   * straight away.
   *
   * UsersService calls this too, when a password changes or an account is
   * closed or restored. It passes its transaction's `manager`, so that
   * change and the end of the sessions succeed or fail together.
   */
  async endAll(userId: number, manager?: EntityManager): Promise<void> {
    await this.sessionsRepository.revokeSessionsOfUser(userId, this.now(), manager);
  }

  /**
   * Whether a session is still going: it exists, nobody ended it, and it has
   * not reached its end. JwtAuthGuard asks on every logged-in request, which
   * is why ending a session stops its access token at once.
   */
  isLive(sessionId: string): Promise<boolean> {
    return this.sessionsRepository.isSessionLive(sessionId, this.now());
  }

  // Makes one pair for a session: saves a new refresh token that points at
  // the session, and signs an access token that carries the session's id.
  //
  // Saving a token is also when old rows are deleted: every session that
  // ended 180 days ago or more, with its tokens. That is the only
  // housekeeping the two tables get. There is no scheduler, and each login
  // and each refresh passes through here.
  private async pair(
    user: TokenOwner,
    session: Pick<Session, "id" | "expiresAt">,
    now: string,
  ): Promise<TokenPair> {
    const refreshToken = newOneTimeToken();

    await this.sessionsRepository.saveToken({
      id: hashOf(refreshToken),
      sessionId: session.id,
      // A new 7 days from now, but never past the session's own end.
      expiresAt: this.earlier(this.after(now, this.auth.refreshExpiresIn), session.expiresAt),
    });
    await this.sessionsRepository.deleteSessionsEndedBy(
      this.before(now, this.auth.sessionRetention),
    );

    return {
      accessToken: await this.signToken(user, session.id),
      refreshToken,
      expiresIn: this.auth.expiresIn,
    };
  }

  // Signs the access token. The secret, the lifetime, the audience, the
  // issuer and the algorithm are all set once, on JwtModule in AuthModule, so
  // nothing but the payload is passed here.
  private signToken(user: TokenOwner, sessionId: string): Promise<string> {
    return this.jwtService.signAsync(jwtPayloadFor(user, sessionId));
  }

  // Over means the session cannot be used any more, for either reason: it
  // was ended on purpose, or it reached its end.
  private isOver(session: Pick<Session, "revokedAt" | "expiresAt">, now: string): boolean {
    return session.revokedAt !== null || !isAfterUtc(session.expiresAt, now);
  }

  // A refresh token was used a second time. Ends the session, says so in the
  // log, and returns the exception for the caller to throw. The log names
  // the member and the session and never the token.
  private async endStolenSession(
    session: Pick<Session, "id" | "userId">,
    now: string,
  ): Promise<RefreshTokenInvalidException> {
    await this.sessionsRepository.revokeSession(session.id, now);
    this.logger.warn(
      `A refresh token of user #${session.userId} was used twice. Session ${session.id} is ended.`,
    );
    return new RefreshTokenInvalidException();
  }

  // The current time, from the app's clock. Every time this service writes
  // or compares comes from here, and none from the database's clock, so the
  // two can never disagree.
  //
  // gmt returns "" when it cannot read the clock or do the sum, and the
  // helpers turn that into a 503. See CLOCK_UNAVAILABLE in
  // src/shared/error-codes.ts.
  private now(): string {
    return utcNowOrThrow();
  }

  private after(instant: string, seconds: number): string {
    return orClockUnavailable(addUtc(instant, { seconds }));
  }

  private before(instant: string, seconds: number): string {
    return orClockUnavailable(subtractUtc(instant, { seconds }));
  }

  private earlier(first: string, second: string): string {
    return orClockUnavailable(minUtc([first, second]));
  }
}
