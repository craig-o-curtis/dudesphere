import type { JwtService } from "@nestjs/jwt";

import { jwtPayloadFor } from "../shared/guards/auth-user.js";
import type { UserResponseDto } from "../users/dto/user-response.dto.js";
import type { UsersService } from "../users/users.service.js";

// A token for trying the API by hand, in Thunder Client or with curl, without
// logging in first. DEVELOPMENT.md, "Try the API by hand", shows how it is
// used. The runner is print-token.ts; this file is the part that can be
// tested without starting the app.

/** How long a dev token lasts. Long enough that a saved request keeps working. */
export const DEV_TOKEN_DAYS = 30;

const SECONDS_IN_A_DAY = 24 * 60 * 60;

export interface DevTokenRequest {
  /** NODE_ENV, as the app reads it. */
  environment: string;
  /** EMAIL from .env: the seeded admin. Used when no identifier is given. */
  adminEmail: string | undefined;
  /** A username or an email. Leave it out for the admin. */
  identifier: string | undefined;
}

/**
 * Signs a token for one user, with no password asked.
 *
 * It is signed by the app's own JwtService, so the secret, the audience and
 * the issuer are the app's and JwtAuthGuard accepts it like any other. Only
 * the lifetime is passed here: @nestjs/jwt lays the options of one call over
 * the module's.
 *
 * The user is read from the database, so the token names a real id. It
 * carries no role: JwtAuthGuard reads the role from the database on every
 * request, so this token is worth whatever its member is at that moment, and
 * nothing once the account is closed.
 *
 * It throws a plain Error, with a message a person can act on, when it will
 * not sign. Nothing is signed in that case.
 */
export async function createDevToken(
  jwtService: JwtService,
  usersService: UsersService,
  { environment, adminEmail, identifier }: DevTokenRequest,
): Promise<{ token: string; user: UserResponseDto }> {
  // Checked first, before anything is read. A token that needs no password
  // has no place where real members are.
  if (environment === "production") {
    throw new Error("pnpm dev:token does not run when NODE_ENV is production.");
  }

  const wanted = identifier ?? adminEmail;
  if (!wanted) {
    throw new Error(
      "No user to sign a token for. Set EMAIL in .env for the admin, or name one: pnpm dev:token <username or email>",
    );
  }

  const user = await usersService.getUserByIdentifier(wanted);
  if (!user) {
    const hint = identifier ? "" : " Run pnpm seed:run to create the admin.";
    throw new Error(`No user has the username or email "${wanted}".${hint}`);
  }

  const token = await jwtService.signAsync(jwtPayloadFor(user), {
    expiresIn: DEV_TOKEN_DAYS * SECONDS_IN_A_DAY,
  });
  return { token, user };
}
