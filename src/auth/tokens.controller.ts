import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { minutes } from "@nestjs/throttler";

import type { AuthUser } from "../shared/guards/auth-user.js";
import { Auth } from "../shared/guards/auth.decorator.js";
import { CurrentUser } from "../shared/guards/current-user.decorator.js";
import { Public } from "../shared/guards/public.decorator.js";
import { ThrottleByAccount } from "../shared/guards/throttle-by-account.decorator.js";
import { AuthService } from "./auth.service.js";
import { LoginDto } from "./dto/login.dto.js";
import { RefreshTokenDto } from "./dto/refresh-token.dto.js";
import { type TokenPair, TokenService } from "./token.service.js";

// The routes that hand out tokens and take them back. The paths and the
// answer are the ones the NestJS docs use: POST /auth/token signs in.
//
// The access labels are on each method, not on the class. This controller
// mixes routes anyone may call with routes for a signed-in caller, and a
// method's @Auth() does not cancel a class's @Public().
@Controller("auth/token")
export class TokensController {
  constructor(
    private readonly authService: AuthService,
    private readonly tokenService: TokenService,
  ) {}

  // Signs in. Public, and it has to be: this is the route that issues the
  // token every other route needs.
  //
  // 200, not POST's default 201. It creates nothing a client could later
  // fetch; it answers a question.
  //
  // 5 tries in 15 minutes for one account from one IP address, right or
  // wrong. That is slow enough to make guessing a password pointless, and a
  // person who mistypes theirs a few times is not shut out for long. The
  // sixth gets a 429 with a Retry-After header.
  //
  // The 100 a minute every route has still counts here, by IP address alone.
  // It stops one address from trying a few passwords on every account.
  @Public()
  @ThrottleByAccount("identifier", { limit: 5, ttl: minutes(15) })
  @Post()
  @HttpCode(200)
  issue(@Body() loginDto: LoginDto): Promise<TokenPair> {
    return this.authService.signIn(loginDto);
  }

  // Swaps a refresh token for a new pair, when the access token has expired
  // or is about to. Public: the caller's access token may already be dead,
  // and the refresh token in the body is the proof of who they are.
  //
  // The refresh token works once. A client must send one refresh at a time
  // for a session and keep the new pair from the answer: a second request
  // with the same token ends the session. See TokenService.refresh.
  //
  // An unknown, expired or used token gets a 401 REFRESH_TOKEN_INVALID, and
  // the client sends the member to sign in again.
  //
  // No limit of its own. A guessed token costs one lookup, and there are
  // 2^256 of them.
  @Public()
  @Post("refresh")
  @HttpCode(200)
  refresh(@Body() { refreshToken }: RefreshTokenDto): Promise<TokenPair> {
    return this.tokenService.refresh(refreshToken);
  }

  // Signs out this device: ends the session the refresh token belongs to.
  // Its access token stops on the next request, and its refresh tokens can
  // no longer be swapped. The member's other devices stay signed in.
  //
  // Public, like refresh: a client must be able to sign out with an access
  // token that has already expired.
  //
  // 204 every time, for a real token and an unknown one alike. A different
  // answer would tell a caller whether a token they hold is real.
  @Public()
  @Post("revoke")
  @HttpCode(204)
  revoke(@Body() { refreshToken }: RefreshTokenDto): Promise<void> {
    return this.tokenService.revoke(refreshToken);
  }

  // Signs the caller out on every device, this one included. For a member
  // who has lost a phone, or thinks someone else is signed in as them.
  //
  // Needs a signed-in caller, and ends that caller's sessions only: the user
  // id comes from the access token, never from the body.
  @Auth()
  @Post("revoke-all")
  @HttpCode(204)
  revokeAll(@CurrentUser() user: AuthUser): Promise<void> {
    return this.tokenService.revokeAll(user.userId);
  }
}
