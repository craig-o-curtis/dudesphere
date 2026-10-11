import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { getUtcNow } from "@northguild/gmt";

import { RefreshTokensService } from "../../auth/refresh-tokens.service.js";
import { UsersService } from "../../users/users.service.js";
import { ErrorCode } from "../error-codes.js";
import { TokenMissingException } from "../exceptions/token-missing.exception.js";
import type { AuthUser, RequestWithUser, VerifiedJwtPayload } from "./auth-user.js";
import { IS_PUBLIC_KEY } from "./public.decorator.js";

// Checks the token, loads the user it belongs to, and puts that user on the
// request. RolesGuard and @CurrentUser(), both in this folder, read that user.
//
// A token only proves who logged in, and when. It says nothing about today:
// the account may have been closed since, the member may no longer be an
// admin, or they may have signed out. So the guard takes two things from the
// token, the user's id and the session's id, and reads the rest from the
// database on every request.
//
// Depends on JwtService, which AuthModule registers globally, on Reflector,
// which Nest provides everywhere, and on UsersService and
// RefreshTokensService, whose modules AppModule imports. So it needs no
// module of its own.
//
// No @Inject on the constructor parameters, on purpose. `pnpm seed:run` and
// `pnpm dev:token` start AppModule through tsx, which gives Nest no parameter
// types. With @Inject on some parameters and not others, Nest refuses to
// start there. With none, it builds the guard with nothing, which is fine:
// those commands never handle a request.
//
// AppModule registers this as an APP_GUARD, so it runs on every route. Routes
// an anonymous caller is meant to reach carry @Public(). On those the token is
// optional: a good one still identifies the caller, and a bad one is ignored.
//
// Every other route needs a token, whether it carries a label or not. Needing
// a token is the default, so a route someone forgot to label is closed, not
// open. Those routes carry @Auth(), which RolesGuard reads next.
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly usersService: UsersService,
    private readonly refreshTokens: RefreshTokensService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = this.getBearerToken(request);

    // Is this route marked @Public()? @Public() stored `true` on the route
    // under IS_PUBLIC_KEY when the controller file loaded. Reflector reads it
    // back here: from the handler first, then from the controller class, and
    // the first one that has a value wins. A route with no @Public() has
    // nothing stored, so this is undefined and the token is required.
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(), // checks if @Public() is on route
      context.getClass(), // checks if @Public() is on the class
    ]);
    if (isPublic) {
      // Nobody has to sign in here, so a missing or bad token is not an
      // error, and neither is a token whose user is gone. But a caller who
      // did send a good token is still that user:
      // without this, a fault on a public route was logged as "anonymous"
      // even for a signed-in caller, and @CurrentUser() could never be used
      // on one. A request with no token costs nothing extra.
      if (token) {
        request.user = await this.verifyToken(token).catch(() => undefined);
      }
      return true;
    }

    if (!token) {
      throw new TokenMissingException("Missing or invalid authorization header");
    }

    request.user = await this.verifyToken(token);
    return true;
  }

  private getBearerToken(request: RequestWithUser): string | undefined {
    const authHeader = request.headers.authorization;
    return authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : undefined;
  }

  // The user a token belongs to. Throws a 401 when the token is bad, its
  // user is gone, or its session has ended. Three checks:
  //
  // 1. Is the token real? verifyAsync rejects one with a bad signature, a
  //    past expiry, or the wrong audience, issuer or algorithm. Those rules
  //    are set once, on JwtModule in AuthModule.
  // 2. Does its user still exist? The token gives the id. The username and
  //    the role come from the database, so a member who was demoted or whose
  //    account was closed after logging in is seen as they are now.
  // 3. Is its session still going? Signing out, a password change, or a
  //    refresh token used twice ends a session, and its access token stops
  //    here, on the next request, and not 15 minutes later when it expires.
  //
  // Checks 2 and 3 are one small query each, and run side by side.
  private async verifyToken(token: string): Promise<AuthUser> {
    let payload: VerifiedJwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<VerifiedJwtPayload>(token);
    } catch (error) {
      throw this.invalidToken(error);
    }

    const [user, sessionIsLive] = await Promise.all([
      this.usersService.getUserForToken(payload.sub, payload.iat),
      this.isSessionLive(payload.sid),
    ]);
    if (!user || !sessionIsLive) {
      throw this.invalidToken();
    }
    return user;
  }

  // Whether the session a token names is still going.
  //
  // A token with no session id passes. Only two kinds exist: one from
  // `pnpm dev:token`, which belongs to no session, and one signed before
  // sessions were added, which expires within the hour. Nobody else can make
  // one, because nobody else can sign a token.
  private async isSessionLive(sessionId: string | undefined): Promise<boolean> {
    if (sessionId === undefined) {
      return true;
    }
    // The column is a uuid, and Postgres raises an error for anything else.
    // Only this app signs tokens, so this cannot happen. If it ever did, the
    // answer should be "no such session" and not a 500.
    if (!UUID_SHAPE.test(sessionId)) {
      return false;
    }

    // getUtcNow returns "" on failure. See CLOCK_UNAVAILABLE in
    // src/shared/error-codes.ts.
    const now = getUtcNow();
    if (!now) {
      throw new ServiceUnavailableException("Could not read the current UTC time", {
        errorCode: ErrorCode.CLOCK_UNAVAILABLE,
      });
    }
    return this.refreshTokens.isSessionLive(sessionId, now);
  }

  // One answer for every token that is refused, so a caller cannot tell a
  // forged token from one whose account was closed or whose session ended.
  private invalidToken(cause?: unknown): UnauthorizedException {
    return new UnauthorizedException("Invalid or expired token", {
      cause,
      errorCode: ErrorCode.TOKEN_INVALID,
    });
  }
}
