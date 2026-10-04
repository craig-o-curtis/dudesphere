/** The logged-in user, as JwtAuthGuard puts it on the request. */
export interface AuthUser {
  userId: number;
  username: string;
  role: string;
}

/** What login signs into the token. `sub` is the user's id. */
export interface JwtPayload {
  sub: number; // sub is for "subject", the user id
  username: string;
  role: string;
}
