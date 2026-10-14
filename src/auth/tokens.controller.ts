import { Public, TokenService } from "@nestjs/authentication";
import { Body, Controller, HttpCode, Post, UnauthorizedException } from "@nestjs/common";
import { minutes, Throttle } from "@nestjs/throttler";

import { ErrorCode } from "../shared/error-codes.js";
import { RefreshTokenDto, SignInDto } from "./auth.dto.js";
import { CredentialsService } from "./credentials.service.js";

/**
 * Bearer tokens for the app: the docs' TokensController, from "Issue tokens
 * to the mobile app" on https://docs.nestjs.com/security/authentication.
 *
 * POST /auth/token signs in and answers { accessToken, refreshToken,
 * expiresIn }. The access token is a JWT that lasts JWT_EXPIRES_IN seconds
 * and goes in the Authorization header. The refresh token is opaque, works
 * once, and is swapped at /refresh for a new pair. If a used refresh token
 * comes back, two parties hold it, so TokenService ends the whole sign-in
 * and both sign in again.
 *
 * Every route is public: a client calls them when it has no access token, or
 * one that has run out.
 */
@Public()
@Controller("auth/token")
export class TokensController {
  constructor(
    private readonly credentialsService: CredentialsService,
    private readonly tokenService: TokenService,
  ) {}

  // 200, not POST's default 201: nothing is created that the caller can
  // fetch. 5 tries in 15 minutes for one identifier from one address, so
  // nobody can guess a password quickly. AuthThrottlerGuard counts them.
  @Throttle({ default: { limit: 5, ttl: minutes(15) } })
  @Post()
  @HttpCode(200)
  async issue(@Body() body: SignInDto) {
    const user = await this.credentialsService.verify(body.identifier, body.password);
    if (!user) {
      // One message for every case, so the answer doesn't reveal which
      // usernames and emails have an account.
      throw new UnauthorizedException("Invalid username, email or password", {
        errorCode: ErrorCode.BAD_CREDENTIALS,
      });
    }
    return this.tokenService.issue(String(user.id), {
      method: "password",
      // `amr` goes into this access token and into every refreshed one.
      claims: { amr: ["pwd"] },
    });
  }

  // An unknown, expired or reused refresh token gets a 401.
  @Post("refresh")
  @HttpCode(200)
  refresh(@Body() { refreshToken }: RefreshTokenDto) {
    return this.tokenService.refresh(refreshToken);
  }

  // Signs the app out on this device. It ends the token's whole sign-in:
  // the token, the ones before it and the ones after it. Unknown tokens get
  // the same answer, as in RFC 7009.
  @Post("revoke")
  @HttpCode(204)
  async revoke(@Body() { refreshToken }: RefreshTokenDto): Promise<void> {
    await this.tokenService.revoke(refreshToken);
  }
}
