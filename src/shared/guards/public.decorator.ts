import { SetMetadata } from "@nestjs/common";

/** The key @Public() writes. JwtAuthGuard, in this folder, reads it. */
export const IS_PUBLIC_KEY = "isPublic";

/**
 * Opens one route to callers with no token.
 *
 * JwtAuthGuard runs on every route in the app, so without this there is no way
 * in: POST /auth/login would need a token to issue a token, and POST
 * /auth/signup would need one to create the user who would get it. Mark a
 * route public only when an anonymous caller is meant to reach it.
 */
export function Public() {
  return SetMetadata(IS_PUBLIC_KEY, true);
}
