import { AuthenticationRegistry, JwtBearerProvider, type JwtClaims } from "@nestjs/authentication";
import { Inject, Injectable } from "@nestjs/common";
import { addUtc, convertUnixToUtc, isAfterUtc } from "@northguild/gmt";

import type { User } from "../users/user.entity.js";
import { UsersRepository } from "../users/users.repository.js";

// A user id as the access token carries it: String(user.id). At most the
// largest value of the integer `user.id` column, so a forged huge id is
// refused here and never reaches Postgres as an out-of-range number.
const USER_ID = /^[1-9][0-9]{0,9}$/;
const MAX_USER_ID = 2_147_483_647;

/**
 * Signs a request in from its bearer token. The docs' JwtAuth: the package
 * checks the signature against the `accessToken` key, and `exp`, `iss` and
 * `aud`, then passes the verified claims to validate().
 *
 * validate() runs on every signed-in request, so a closed account or a
 * changed password ends the member's access tokens at once.
 *
 * A sign-out does not. The token carries no session, so after a sign-out it
 * works until it expires, at most JWT_EXPIRES_IN (15 minutes). The docs
 * accept the same, which is why access tokens are short.
 */
@Injectable()
export class JwtAuth extends JwtBearerProvider<User> {
  constructor(
    // @Inject names each token outright, because `pnpm seed:run` builds the
    // whole app through tsx, which emits no constructor types.
    @Inject(UsersRepository) private readonly usersRepository: UsersRepository,
    @Inject(AuthenticationRegistry) registry: AuthenticationRegistry,
  ) {
    // The key, issuer and audience come from the `accessToken` options.
    // `realm` goes into the WWW-Authenticate header of a 401.
    super({ realm: "dudesphere" });
    registry.registerProvider(this);
  }

  // Called after the signature and claims checked out. Returning null
  // rejects the token with a 401.
  async validate({ sub, iat }: JwtClaims): Promise<User | null> {
    if (!sub || !USER_ID.test(sub) || Number(sub) > MAX_USER_ID || typeof iat !== "number") {
      return null;
    }
    // A soft-deleted member is not found, so closing an account ends its
    // tokens at once.
    const user = await this.usersRepository.findById(Number(sub));
    if (!user || !signedAfterPasswordChange(iat, user.passwordChangedAt)) {
      return null;
    }
    return user;
  }
}

// Whether a token signed at `issuedAt`, in seconds since 1970, is not older
// than the member's last password change. Whoever holds an older token
// signed in with the old password.
//
// A token records only the second it was signed in. So a token signed in the
// same second as the change is let through: that is far more often the member
// signing in straight after a reset than an old token. Any earlier second is
// refused. If a time cannot be read, gmt returns "", and the token is refused.
function signedAfterPasswordChange(issuedAt: number, passwordChangedAt: string | null): boolean {
  if (passwordChangedAt === null) {
    return true;
  }
  const endOfIssuedSecond = addUtc(convertUnixToUtc(issuedAt, { epochUnit: "seconds" }), {
    seconds: 1,
  });
  return isAfterUtc(endOfIssuedSecond, passwordChangedAt);
}
