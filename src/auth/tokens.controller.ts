import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { minutes } from "@nestjs/throttler";

import { Public } from "../shared/guards/public.decorator.js";
import { ThrottleByAccount } from "../shared/guards/throttle-by-account.decorator.js";
import { AuthService } from "./auth.service.js";
import { LoginDto } from "./dto/login.dto.js";
import { type AccessTokenResult, TokenService } from "./token.service.js";

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
  async issue(@Body() loginDto: LoginDto): Promise<AccessTokenResult> {
    const user = await this.authService.verifyCredentials(loginDto);
    return this.tokenService.issue(user);
  }
}
