import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";

import { IS_PUBLIC_KEY } from "../../shared/auth-metadata.js";
import { ErrorCode } from "../../shared/error-codes.js";
import type { AuthUser, JwtPayload } from "../auth-user.js";

interface RequestWithUser {
  headers: { authorization?: string };
  user?: AuthUser;
}

// Depends only on JwtService, which AuthModule registers globally, and
// Reflector, which Nest provides everywhere. So any feature can use this guard
// without importing AuthModule. That matters: AuthModule imports UsersModule,
// which imports ProfilesModule, so an import the other way would close a cycle.
//
// AppModule registers this as an APP_GUARD, so it runs on every route. Routes
// an anonymous caller is meant to reach carry @Public(). On those the token is
// optional: a good one still identifies the caller, and a bad one is ignored.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = this.bearerToken(request);

    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      // Nobody has to sign in here, so a missing or bad token is not an
      // error. But a caller who did send a good token is still that user:
      // without this, a fault on a public route was logged as "anonymous"
      // even for a signed-in caller, and @CurrentUser() could never be used
      // on one. A request with no token costs nothing extra.
      if (token) {
        request.user = await this.readUser(token).catch(() => undefined);
      }
      return true;
    }

    if (!token) {
      throw new UnauthorizedException("Missing or invalid authorization header", {
        errorCode: ErrorCode.TOKEN_MISSING,
      });
    }

    try {
      request.user = await this.readUser(token);
    } catch (error) {
      throw new UnauthorizedException("Invalid or expired token", {
        cause: error,
        errorCode: ErrorCode.TOKEN_INVALID,
      });
    }
    return true;
  }

  private bearerToken(request: RequestWithUser): string | undefined {
    const authHeader = request.headers.authorization;
    return authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : undefined;
  }

  // verifyAsync checks the signature and the expiry, and rejects if either
  // is wrong.
  private async readUser(token: string): Promise<AuthUser> {
    const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    return { userId: payload.sub, username: payload.username, role: payload.role };
  }
}
