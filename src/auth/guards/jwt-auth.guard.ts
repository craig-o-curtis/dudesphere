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
// an anonymous caller is meant to reach carry @Public().
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Checked before the header, so a public route never pays for a token it
    // was not asked to send.
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing or invalid authorization header", {
        errorCode: ErrorCode.TOKEN_MISSING,
      });
    }

    const token = authHeader.slice("Bearer ".length);

    let payload: JwtPayload;
    try {
      // Checks the signature and the expiry.
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch (error) {
      throw new UnauthorizedException("Invalid or expired token", {
        cause: error,
        errorCode: ErrorCode.TOKEN_INVALID,
      });
    }

    request.user = { userId: payload.sub, username: payload.username, role: payload.role };
    return true;
  }
}
