import { createParamDecorator, ExecutionContext } from "@nestjs/common";

import type { AuthUser } from "../auth-user.js";

/**
 * The logged-in user. Only use it on a route behind JwtAuthGuard, because the
 * guard is what puts the user on the request.
 */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<{ user: AuthUser }>();
  return request.user;
});
