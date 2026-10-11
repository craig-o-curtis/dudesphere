import { createParamDecorator, ExecutionContext } from "@nestjs/common";

import type { RequestWithUser } from "./auth-user.js";

/**
 * The logged-in user. Only use it on a route behind JwtAuthGuard, because the
 * guard is what puts the user on the request.
 */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  // The context holds the current request. switchToHttp() gives the HTTP
  // view of it, and getRequest() the request object itself.
  const request = context.switchToHttp().getRequest<RequestWithUser>();
  return request.user;
});
