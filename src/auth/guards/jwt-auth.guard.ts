import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

import type { AuthUser, JwtPayload } from "../auth-user.js";

interface RequestWithUser {
  headers: { authorization?: string };
  user?: AuthUser;
}

// Depends only on JwtService, which AuthModule registers globally. So any
// feature can use this guard without importing AuthModule. That matters:
// AuthModule imports UsersModule, which imports ProfileModule, so an import
// the other way would close a cycle.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing or invalid authorization header");
    }

    const token = authHeader.slice("Bearer ".length);

    let payload: JwtPayload;
    try {
      // Checks the signature and the expiry.
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }

    request.user = { userId: payload.sub, username: payload.username, role: payload.role };
    return true;
  }
}
