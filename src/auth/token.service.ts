import { randomUUID } from "node:crypto";

import { Inject, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { addUtc, getUtcNow, isAfterUtc, minUtc } from "@northguild/gmt";

import { ErrorCode } from "../shared/error-codes.js";
import { RefreshTokenInvalidException } from "../shared/exceptions/refresh-token-invalid.exception.js";
import { jwtPayloadFor } from "../shared/guards/auth-user.js";
import { UsersService } from "../users/users.service.js";
import authConfig from "./config/auth.config.js";
import { hashOf, isOneTimeToken, newOneTimeToken } from "./one-time-token.js";
import { RefreshTokensService } from "./refresh-tokens.service.js";

/**
 * What signing in, and refreshing, answer with. The names are OAuth's, and
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
 * Makes the tokens a signed-in member holds, renews them, and ends them.
 *
 * Two tokens, for two jobs:
 *
 * - The access token is a JWT that lasts 15 minutes. It goes with every
 *   request, and JwtAuthGuard checks it.
 * - The refresh token is random text that lasts 7 days. It goes to one route
 *   only, to be swapped for a new pair. The database keeps a hash of it.
 *
 * A refresh token works once. Swapping it marks it used and hands out a
 * successor. Every token that descends from one sign-in shares a family id,
 * and that family is the session. If a used token comes back, two parties
 * hold it, a thief and the member, and nothing says which is which. So the
 * whole session is ended and both sign in again.
 *
 * The design and the method names (issue, refresh, revoke, revokeAll) are
 * the ones in the NestJS authentication docs.
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    // @Inject names every token outright. `pnpm seed:run` and `pnpm dev:token`
    // start the whole app through tsx, which does not emit the constructor
    // types Nest otherwise reads. With @Inject on some parameters and not
    // others, Nest refuses to start there.
    @Inject(JwtService)
    private readonly jwtService: JwtService,
    @Inject(RefreshTokensService)
    private readonly refreshTokens: RefreshTokensService,
    @Inject(UsersService)
    private readonly usersService: UsersService,
    // authConfig.KEY is not a secret. It is the name Nest gives the "auth"
    // config object, used here to ask for it.
    @Inject(authConfig.KEY) private readonly auth: ConfigType<typeof authConfig>,
  ) {}

  /**
   * At sign-in, once the password has been checked: starts a session and
   * returns its first pair of tokens.
   */
  async issue(user: TokenOwner): Promise<TokenPair> {
    const now = this.now();
    // A new family: this sign-in's session. Its end is fixed here and no
    // refresh moves it.
    const familyId = randomUUID();
    const familyExpiresAt = this.after(now, this.auth.sessionExpiresIn);

    return this.pair(user, familyId, familyExpiresAt, now);
  }

  /**
   * Swaps a refresh token for a new pair in the same session. The token is
   * spent: it cannot be swapped again.
   *
   * Throws RefreshTokenInvalidException, a 401, for a token that is unknown,
   * expired, already used, or whose session or member is gone. The checks
   * run in the order the NestJS docs give.
   */
  async refresh(refreshToken: string): Promise<TokenPair> {
    // 1. Not the shape of a token made here, so it cannot match a row. An
    //    access token sent by mistake ends here.
    if (!isOneTimeToken(refreshToken)) {
      throw new RefreshTokenInvalidException();
    }

    const now = this.now();
    const token = await this.refreshTokens.find(hashOf(refreshToken));

    // 2. No such token, or its session was ended: by a sign-out, a password
    //    change, or an earlier theft.
    if (!token || (await this.refreshTokens.isFamilyRevoked(token.familyId))) {
      throw new RefreshTokenInvalidException();
    }

    // 3. Used before. Two parties hold this token, so the session ends.
    if (token.usedAt) {
      throw await this.endStolenSession(token.familyId, token.userId);
    }

    // 4. Unused, and past its time. The member was away too long. This is not
    //    theft, so the session is left as it is.
    if (!isAfterUtc(token.expiresAt, now)) {
      throw new RefreshTokenInvalidException();
    }

    // 5. The account was closed since. End the session, so its other tokens
    //    are refused without another lookup.
    const user = await this.usersService.getLiveUser(token.userId);
    if (!user) {
      await this.refreshTokens.revokeFamily(token.familyId);
      throw new RefreshTokenInvalidException();
    }

    // 6. Hand out the successor, then spend this token. In that order: if the
    //    app stops between the two, the member still holds a token that
    //    works, and can try again.
    const owner = { id: user.userId, username: user.username };
    const pair = await this.pair(owner, token.familyId, token.familyExpiresAt, now);

    // The mark is one conditional statement. If it changed nothing, another
    // request spent this same token in the moment since step 3. That is a
    // second use like any other, and the successor just saved goes with the
    // session.
    const spentByThisCall = await this.refreshTokens.markUsed(token.id, now);
    if (!spentByThisCall) {
      throw await this.endStolenSession(token.familyId, token.userId);
    }

    return pair;
  }

  // Makes one pair for a session: saves a new refresh token in the family,
  // and signs an access token that names the family as its session.
  private async pair(
    user: TokenOwner,
    familyId: string,
    familyExpiresAt: string,
    now: string,
  ): Promise<TokenPair> {
    const refreshToken = newOneTimeToken();

    await this.refreshTokens.save(
      {
        id: hashOf(refreshToken),
        familyId,
        userId: user.id,
        // A new 7 days from now, but never past the session's own end.
        expiresAt: this.earlier(this.after(now, this.auth.refreshExpiresIn), familyExpiresAt),
        familyExpiresAt,
      },
      now,
    );

    return {
      accessToken: await this.signToken(user, familyId),
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

  // A refresh token was used a second time. Ends the session, says so in the
  // log, and returns the exception for the caller to throw. The log names
  // the member and the session and never the token.
  private async endStolenSession(
    familyId: string,
    userId: number,
  ): Promise<RefreshTokenInvalidException> {
    await this.refreshTokens.revokeFamily(familyId);
    this.logger.warn(
      `A refresh token of user #${userId} was used twice. Session ${familyId} is ended.`,
    );
    return new RefreshTokenInvalidException();
  }

  // The current time, from the app's clock. Every time this service writes
  // or compares comes from here, and none from the database's clock, so the
  // two can never disagree.
  //
  // getUtcNow returns "" on failure. See CLOCK_UNAVAILABLE in
  // src/shared/error-codes.ts.
  private now(): string {
    return this.orClockUnavailable(getUtcNow());
  }

  private after(instant: string, seconds: number): string {
    return this.orClockUnavailable(addUtc(instant, { seconds }));
  }

  private earlier(first: string, second: string): string {
    return this.orClockUnavailable(minUtc([first, second]) ?? "");
  }

  private orClockUnavailable(instant: string): string {
    if (!instant) {
      throw new ServiceUnavailableException("Could not read the current UTC time", {
        errorCode: ErrorCode.CLOCK_UNAVAILABLE,
      });
    }
    return instant;
  }
}
