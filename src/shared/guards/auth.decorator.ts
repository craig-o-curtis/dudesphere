import { SetMetadata } from "@nestjs/common";

import type { UserRole } from "../../users/user.entity.js";

/** The key @Auth() writes. RolesGuard, in this folder, reads it. */
export const ROLES_KEY = "roles";

/**
 * Says a route needs a signed-in caller, and which roles may call it.
 *
 *   @Auth()                 any signed-in caller
 *   @Auth(UserRole.ADMIN)   a signed-in admin
 *
 * It stores the list of roles on the route. RolesGuard reads the list on
 * every request and refuses a caller who is not signed in or whose role is
 * not in it. An empty list means any role.
 */
export function Auth(...roles: UserRole[]) {
  return SetMetadata(ROLES_KEY, roles);
}
