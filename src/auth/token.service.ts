import { Inject, Injectable } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";

import { jwtPayloadFor } from "../shared/guards/auth-user.js";
import authConfig from "./config/auth.config.js";

/**
 * What signing in answers with. The names are OAuth's, and the ones the
 * NestJS docs use.
 */
export interface AccessTokenResult {
  /** A signed JWT. Sent back as `Authorization: Bearer <accessToken>`. */
  accessToken: string;
  /** How long the access token lasts, in seconds, so a client knows when to get a new one. */
  expiresIn: number;
}

/**
 * Makes the tokens a signed-in member holds.
 *
 * The method names are the ones the NestJS docs give their token service:
 * issue here, and refresh, revoke and revokeAll as they are added.
 */
@Injectable()
export class TokenService {
  constructor(
    // @Inject names both tokens outright. `pnpm seed:run` and `pnpm dev:token`
    // start the whole app through tsx, which does not emit the constructor
    // types Nest otherwise reads. With @Inject on one parameter and not the
    // other, Nest refuses to start there.
    @Inject(JwtService)
    private readonly jwtService: JwtService,
    // authConfig.KEY is not a secret. It is the name Nest gives the "auth"
    // config object, used here to ask for it.
    @Inject(authConfig.KEY) private readonly auth: ConfigType<typeof authConfig>,
  ) {}

  /** At sign-in, once the password has been checked: the tokens for that member. */
  async issue(user: { id: number; username: string }): Promise<AccessTokenResult> {
    return {
      accessToken: await this.signToken(user),
      expiresIn: this.auth.expiresIn,
    };
  }

  // Signs the access token. The secret, the lifetime, the audience, the
  // issuer and the algorithm are all set once, on JwtModule in AuthModule, so
  // nothing is passed here.
  private signToken(user: { id: number; username: string }): Promise<string> {
    return this.jwtService.signAsync(jwtPayloadFor(user));
  }
}
