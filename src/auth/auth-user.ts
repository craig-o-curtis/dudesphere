import type { UserRole } from "../users/user.entity.js";

/** The logged-in user, as JwtAuthGuard puts it on the request. */
export interface AuthUser {
  userId: number;
  username: string;
  // UserRole, not string: RolesGuard compares this against the roles a route
  // asks for, and a plain string would let a typo through the type checker.
  role: UserRole;
}

/** What login signs into the token. `sub` is the user's id. */
export interface JwtPayload {
  sub: number; // sub is for "subject", the user id
  username: string;
  role: UserRole;
}
