import { SetMetadata } from "@nestjs/common";

import type { UserRole } from "../../users/user.entity.js";
import { ROLES_KEY } from "../auth-metadata.js";

/**
 * Limits a route to the given roles. RolesGuard reads this.
 *
 * Works on a method or a whole controller. A route with no `@Roles` is open to
 * any signed-in caller, so this says "narrower than signed in", never "signed
 * in" on its own — JwtAuthGuard already covers that.
 */
export function Roles(...roles: UserRole[]) {
  return SetMetadata(ROLES_KEY, roles);
}
