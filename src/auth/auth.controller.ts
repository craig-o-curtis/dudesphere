import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { minutes } from "@nestjs/throttler";

import type { AuthUser } from "../shared/guards/auth-user.js";
import { Auth } from "../shared/guards/auth.decorator.js";
import { CurrentUser } from "../shared/guards/current-user.decorator.js";
import { Public } from "../shared/guards/public.decorator.js";
import { ThrottleByAccount } from "../shared/guards/throttle-by-account.decorator.js";
import { CreateUserDto } from "../users/dto/create-user.dto.js";
import { AuthService } from "./auth.service.js";
import { ForgotPasswordDto } from "./dto/forgot-password.dto.js";
import { LoginDto } from "./dto/login.dto.js";
import { RefreshTokenDto } from "./dto/refresh-token.dto.js";
import { ResetPasswordDto } from "./dto/reset-password.dto.js";
import { PasswordResetService } from "./password-reset/password-reset.service.js";
import { SessionsService, type TokenPair } from "./sessions/sessions.service.js";

// Every /auth route, in three groups:
//
// - signup: makes an account.
// - login, refresh, logout, logout-all: starts, renews and ends a session.
//   SessionsService holds the rules.
// - forgot-password, reset-password: the emailed link for a member who
//   cannot log in. PasswordResetService holds the rules. It has its own
//   token and its own table, and makes no session.
//
// The access labels are on each method, not on the class. This controller
// mixes routes anyone may call with one for a signed-in caller, and a
// method's @Auth() does not cancel a class's @Public().
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionsService: SessionsService,
    private readonly passwordResetService: PasswordResetService,
  ) {}

  @Public()
  @Post("signup")
  signup(@Body() signupDto: CreateUserDto) {
    return this.authService.signup(signupDto);
  }

  // Logs a member in: checks the password and starts a session. Public, and
  // it has to be: this is the route that hands out the access token every
  // other route needs.
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
  @Post("login")
  @HttpCode(200)
  login(@Body() loginDto: LoginDto): Promise<TokenPair> {
    return this.authService.login(loginDto);
  }

  // Swaps a refresh token for a new pair, when the access token has expired
  // or is about to. Public: the caller's access token may already be dead,
  // and the refresh token in the body is the proof of who they are.
  //
  // The refresh token works once. A client must send one refresh at a time
  // for a session and keep the new pair from the answer: a second request
  // with the same token ends the session. See SessionsService.refresh.
  //
  // An unknown, expired or used token gets a 401 REFRESH_TOKEN_INVALID, and
  // the client sends the member to log in again.
  //
  // No limit of its own. A guessed token costs one lookup, and there are
  // 2^256 of them.
  @Public()
  @Post("refresh")
  @HttpCode(200)
  refresh(@Body() { refreshToken }: RefreshTokenDto): Promise<TokenPair> {
    return this.sessionsService.refresh(refreshToken);
  }

  // Logs out this device: ends the session the refresh token belongs to.
  // Its access token stops on the next request, and its refresh tokens can
  // no longer be swapped. The member's other devices stay logged in.
  //
  // Public, like refresh: a client must be able to log out with an access
  // token that has already expired.
  //
  // 204 every time, for a real token and an unknown one alike. A different
  // answer would tell a caller whether a token they hold is real.
  @Public()
  @Post("logout")
  @HttpCode(204)
  logout(@Body() { refreshToken }: RefreshTokenDto): Promise<void> {
    return this.sessionsService.end(refreshToken);
  }

  // Logs the caller out on every device, this one included. For a member
  // who has lost a phone, or thinks someone else is logged in as them.
  //
  // Needs a signed-in caller, and ends that caller's sessions only: the user
  // id comes from the access token, never from the body.
  @Auth()
  @Post("logout-all")
  @HttpCode(204)
  logoutAll(@CurrentUser() user: AuthUser): Promise<void> {
    return this.sessionsService.endAll(user.userId);
  }

  // 202 Accepted, with no body, every time. The work is started and not
  // waited for, so the answer is the same, and as fast, whether or not the
  // address has an account. Nobody can use this route to find out which
  // emails are registered. requestEmail() never rejects, so `void` drops
  // nothing.
  //
  // 3 in 15 minutes for one email from one IP address, which also keeps
  // anyone from flooding a member's inbox. The 100 a minute by IP address
  // alone counts here too, however many emails a caller names.
  @Public()
  @ThrottleByAccount("email", { limit: 3, ttl: minutes(15) })
  @Post("forgot-password")
  @HttpCode(202)
  forgotPassword(@Body() { email }: ForgotPasswordDto): void {
    void this.passwordResetService.requestEmail(email);
  }

  // Called by the page the emailed link opens, with the token from its URL
  // and the new password. 204: the password is changed and there is nothing
  // to send back. The member then logs in with it.
  //
  // No limit of its own. A guessed token costs one lookup, and there are
  // 2^256 of them.
  @Public()
  @Post("reset-password")
  @HttpCode(204)
  resetPassword(@Body() { token, password }: ResetPasswordDto): Promise<void> {
    return this.passwordResetService.reset(token, password);
  }
}
