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
 * What login signs into the token: two ids, and nothing that can change.
 *
 * No role and no username. A token cannot change once it is signed, so
 * either would be a copy that goes stale the moment an admin is demoted or a
 * member is renamed. JwtAuthGuard reads both from the database on every
 * request, and a client that wants to know them asks GET /users/me.
 */
export interface JwtPayload {
  sub: number; // sub is for "subject", the user id
  // "Session id": which login this token belongs to. It is the id of the
  // session's row. A token from `pnpm dev:token` has none, because it
  // belongs to no session.
  sid?: string;
}

/** A payload read back from a token that passed verification. */
export interface VerifiedJwtPayload extends JwtPayload {
  // "Issued at", in seconds since 1970. The library writes it when it signs.
  iat: number;
}

/**
 * The claims for one user. Everything that signs a token builds its payload
 * here: SessionsService at sign-in, and the dev token command in src/dev. The
 * two then differ in one thing only: a sign-in token names its session, and
 * a dev token has none.
 */
export function jwtPayloadFor(userId: number, sessionId?: string): JwtPayload {
  return {
    sub: userId,
    // Left out, not set to undefined, when there is no session.
    ...(sessionId ? { sid: sessionId } : {}),
  };
}
