import { CurrentUser, SignInService } from "@nestjs/authentication";
import { Can } from "@nestjs/authorization";
import { Controller, HttpCode, Post } from "@nestjs/common";

/**
 * The docs' SessionsController, from "Let customers manage their sessions"
 * on https://docs.nestjs.com/security/authentication.
 *
 * Only sign-out-everywhere is here. The docs' list of sessions, and its
 * sign-out of one session, are for browser sessions with a cookie, and this
 * API hands out bearer tokens only. A device signs itself out with
 * POST /auth/token/revoke.
 */
@Controller("auth")
export class SessionsController {
  constructor(private readonly signInService: SignInService) {}

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
