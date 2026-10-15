import { CurrentSession, CurrentUser, type JwtClaims, SignInService } from "@nestjs/authentication";
import { Can } from "@nestjs/authorization";
import { Controller, HttpCode, Post } from "@nestjs/common";

import { SignInsRepository } from "../typeorm/sign-ins.repository.js";

/**
 * The docs' SessionsController, from "Let customers manage their sessions"
 * on https://docs.nestjs.com/security/authentication.
 *
 * Two of the docs' routes are here: sign-out and sign-out-everywhere. The
 * docs' list of sessions, and its sign-out of one session by id, are for
 * browser sessions with a cookie, and this API hands out bearer tokens only.
 *
 * A device can sign itself out two ways. POST /auth/token/revoke takes the
 * refresh token. POST /auth/sign-out takes the access token, for a client
 * that does not hold the refresh token where it needs to sign out.
 */
@Controller("auth")
export class SessionsController {
  constructor(
    private readonly signInService: SignInService,
    private readonly signIns: SignInsRepository,
  ) {}

  // Ends the sign-in this access token belongs to: its whole refresh-token
  // family, and through JwtAuth's sid check, its access tokens, from the
  // next request. The member's other sign-ins carry on.
  //
  // The docs' route has the same path, but ends the browser session in the
  // cookie, and is @Public() so a session waiting for its second factor can
  // sign out. Here there is no cookie: the sign-in is the token's `sid`, so
  // the route needs the token. Called again with the same token, the guard
  // answers 401, because its sign-in has ended.
  @Can.Anyone()
  @Post("sign-out")
  @HttpCode(204)
  async signOut(
    @CurrentUser("id") userId: number,
    // JwtAuth's session is the access token's verified claims, and it has
    // already checked that `sid` is a UUID of a live sign-in of this member.
    @CurrentSession() claims: JwtClaims,
  ): Promise<void> {
    // Only a dev token has no sid. It belongs to no sign-in, so there is
    // nothing to end.
    if (typeof claims.sid !== "string") {
      return;
    }
    await this.signIns.endSignIn(claims.sid, String(userId));
  }

  // Ends every refresh token and every session of the signed-in member, on
  // every device. The access tokens already handed out stop too, on their
  // next request: each names its sign-in, and JwtAuth finds it ended. The
  // docs' version leaves them working until they expire.
  @Can.Anyone()
  @Post("sign-out-everywhere")
  @HttpCode(204)
  async signOutEverywhere(@CurrentUser("id") userId: number): Promise<void> {
    await this.signInService.signOutEverywhere(String(userId));
  }
}
