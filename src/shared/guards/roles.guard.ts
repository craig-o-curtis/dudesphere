// src/shared/guards/roles.guard.ts
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { UserRole } from "../../users/user.entity.js";
import { ErrorCode } from "../error-codes.js";
import { TokenMissingException } from "../exceptions/token-missing.exception.js";
import type { RequestWithUser } from "./auth-user.js";
import { ROLES_KEY } from "./auth.decorator.js";

// Reads the list of roles @Auth() stored on the route and checks it against
// the user JwtAuthGuard put on the request. Registered after JwtAuthGuard in
// AppModule, because it needs the user that guard writes.
//
// Depends only on Reflector, which Nest provides everywhere, so this needs no
// module of its own.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // getAllAndOverride, not get: handler metadata wins over controller
    // metadata, so @Auth on a whole controller can be narrowed or widened on
    // one route later without surprising anyone.
    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @Auth() on this route, so there is no rule to check here.
    if (roles === undefined) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<RequestWithUser>();

    // @Auth() means signed in. JwtAuthGuard runs first and already refuses a
    // caller with no token, so this is a second lock on the same door. A
    // missing identity is a 401, not a 403.
    if (!user) {
      throw new TokenMissingException("Not signed in");
    }

    // @Auth() with no roles: any signed-in caller.
    if (roles.length > 0 && !roles.includes(user.role)) {
      // Thrown, not `return false`, so the message is ours and a test can
      // assert it. Either way the status is 403.
      throw new ForbiddenException("Not authorized to perform this action", {
        errorCode: ErrorCode.ROLE_REQUIRED,
      });
    }

    return true;
  }
}
