import type { JwtSigner } from "@nestjs/authentication";

import type { User } from "../users/user.entity.js";
import type { UsersRepository } from "../users/users.repository.js";

// A token for trying the API by hand, in Thunder Client or with curl, without
// logging in first. DEVELOPMENT.md, "Try the API by hand", shows how it is
// used. The runner is print-token.ts; this file is the part that can be
// tested without starting the app.

/** How long a dev token lasts. Long enough that a saved request keeps working. */
export const DEV_TOKEN_DAYS = 30;

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
 * The signer is built from the app's own `accessToken` options (see
 * print-token.ts), so the key, the audience and the issuer are the app's, and
 * JwtAuth accepts the token. Only the lifetime is passed here.
 *
 * The user is read from the database, so the token names a real id. Beside
 * it the token carries only `amr: ["dev"]`, the mark JwtAuth needs to let a
 * token without a `sid` through. JwtAuth reads the member from the database
 * on every request, so this token is worth whatever its member is at that
 * moment, and nothing once the account is closed or the password changes.
 *
 * It belongs to no sign-in, so no refresh token comes with it, and a
 * sign-out does not end it. It runs out after DEV_TOKEN_DAYS.
 *
 * It throws a plain Error, with a message a person can act on, when it will
 * not sign. Nothing is signed in that case.
 */
export async function createDevToken(
  signer: JwtSigner,
  usersRepository: UsersRepository,
  { environment, adminEmail, identifier }: DevTokenRequest,
): Promise<{ token: string; user: User }> {
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

  const user = await usersRepository.findByIdentifier(wanted);
  if (!user) {
    const hint = identifier ? "" : " Run pnpm seed:run to create the admin.";
    throw new Error(`No user has the username or email "${wanted}".${hint}`);
  }

  // `sub` is the user id as a string, as TokenService.issue signs it.
  // `amr: ["dev"]` marks it as a dev token. It has no `sid`, because it
  // belongs to no sign-in, and JwtAuth lets a token without one through only
  // with this mark.
  const token = signer.sign({ sub: String(user.id), amr: ["dev"] }, { ttl: `${DEV_TOKEN_DAYS}d` });
  return { token, user };
}
