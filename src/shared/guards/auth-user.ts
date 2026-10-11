import type { UserRole } from "../../users/user.entity.js";

/** The logged-in user, as JwtAuthGuard puts it on the request. */
export interface AuthUser {
  userId: number;
  username: string;
  // UserRole, not string: RolesGuard compares this against the roles a route
  // asks for, and a plain string would let a typo through the type checker.
  role: UserRole;
}

/** The parts of a request the guards and @CurrentUser() read. */
export interface RequestWithUser {
  headers: { authorization?: string };
  // Missing on a @Public() route when the caller sent no token, or a bad one.
  user?: AuthUser;
}

/**
 * What login signs into the token. `sub` is the user's id.
 *
 * No role. A token cannot change once it is signed, so a role in it would be
 * a copy that goes stale the moment an admin is demoted. JwtAuthGuard reads
 * the role from the database on every request, and a client that wants to
 * know it asks GET /users/me.
 */
export interface JwtPayload {
  sub: number; // sub is for "subject", the user id
  username: string;
}

/** A payload read back from a token that passed verification. */
export interface VerifiedJwtPayload extends JwtPayload {
  // "Issued at", in seconds since 1970. The library writes it when it signs.
  iat: number;
}

/**
 * The claims for one user. Everything that signs a token builds its payload
 * here: login, and the dev token command in src/dev. A dev token then carries
 * exactly what a login token does, and the guards treat the two alike.
 */
export function jwtPayloadFor(user: { id: number; username: string }): JwtPayload {
  return { sub: user.id, username: user.username };
}
