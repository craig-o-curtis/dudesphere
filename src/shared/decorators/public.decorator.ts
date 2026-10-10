import { SetMetadata } from "@nestjs/common";

import { IS_PUBLIC_KEY } from "../auth-metadata.js";

/**
 * Opens one route to callers with no token.
 *
 * JwtAuthGuard runs on every route in the app, so without this there is no way
 * in: POST /auth would need a token to issue a token, and POST /users would
 * need one to create the user who would get it. Mark a route public only when
 * an anonymous caller is meant to reach it.
 */
export function Public() {
  return SetMetadata(IS_PUBLIC_KEY, true);
}
