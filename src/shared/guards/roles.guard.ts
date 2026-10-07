import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { AuthUser } from "../../auth/auth-user.js";
import type { UserRole } from "../../users/user.entity.js";
import { ROLES_KEY } from "../auth-metadata.js";

interface RequestWithUser {
  user?: AuthUser;
}

// Reads the @Roles() metadata and checks it against the role JwtAuthGuard put
// on the request. Registered after JwtAuthGuard in AppModule, because it needs
// the user that guard writes.
//
// Depends only on Reflector, which Nest provides everywhere, so this needs no
// module of its own.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // getAllAndOverride, not get: handler metadata wins over controller
    // metadata, so @Roles on a whole controller can be narrowed or widened on
    // one route later without surprising anyone.
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No role rule on this route, so any caller JwtAuthGuard let through is
    // allowed. That includes public routes.
    if (!required?.length) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<RequestWithUser>();

    // Defensive. JwtAuthGuard runs first and throws when there is no valid
    // token, so this should be unreachable. If guard order ever changed, a
    // role rule with nobody to check is a missing identity, not a refused
    // one, so 401 rather than 403.
    if (!user) {
      throw new UnauthorizedException("Not signed in");
    }

    if (!required.includes(user.role)) {
      // Thrown, not `return false`, so the message is ours and a test can
      // assert it. Either way the status is 403.
      throw new ForbiddenException("Not authorized to perform this action");
    }

    return true;
  }
}
