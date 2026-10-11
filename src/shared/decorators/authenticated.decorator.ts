import { SetMetadata } from "@nestjs/common";

import { IS_AUTHENTICATED_KEY } from "../auth-metadata.js";

/**
 * Says that a route needs a signed-in caller.
 *
 * This is a label. It changes nothing at run time: JwtAuthGuard runs on every
 * route and already refuses a caller with no token, unless the route carries
 * @Public(). The label is there so a reader of the controller can see the
 * rule, and src/shared/route-access.spec.ts fails when a route has no label
 * at all.
 */
export function Authenticated() {
  return SetMetadata(IS_AUTHENTICATED_KEY, true);
}
