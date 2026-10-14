import { AuthenticationRegistry, JwtBearerProvider, type JwtClaims } from "@nestjs/authentication";
import { Inject, Injectable } from "@nestjs/common";
import { addUtc, convertUnixToUtc, isAfterUtc } from "@northguild/gmt";

import { SignInsRepository } from "../typeorm/sign-ins.repository.js";
import type { User } from "../users/user.entity.js";
import { UsersRepository } from "../users/users.repository.js";

// A user id as the access token carries it: String(user.id). At most the
// largest value of the integer `user.id` column, so a forged huge id is
// refused here and never reaches Postgres as an out-of-range number.
const USER_ID = /^[1-9][0-9]{0,9}$/;
const MAX_USER_ID = 2_147_483_647;

// A sign-in's id, as TokensController makes it: a UUID.
const SID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// What `pnpm dev:token` puts in `amr`, and nothing else beside it. See
// src/dev/dev-token.ts.
const DEV_TOKEN_AMR = "dev";

/**
 * Signs a request in from its bearer token. The docs' JwtAuth: the package
 * checks the signature against the `accessToken` key, and `exp`, `iss` and
 * `aud`, then passes the verified claims to validate().
 *
 * validate() runs on every signed-in request, and refuses a token at once
 * when any of these is true:
 *
 * - the member's account is closed;
 * - the password changed after the token was signed;
 * - the token's sign-in was ended: a sign-out, a sign-out everywhere, a
 *   refresh token used twice, a reset, a password change, a closed account.
 *
 * The last check is not in the docs. With the docs alone, an access token
 * outlives its sign-in by up to JWT_EXPIRES_IN. Here every access token
 * carries its sign-in's id, `sid`, and SignInsRepository.isLive asks whether
 * that sign-in is still going.
 */
@Injectable()
export class JwtAuth extends JwtBearerProvider<User> {
  constructor(
    // @Inject names each token outright, because `pnpm seed:run` builds the
    // whole app through tsx, which emits no constructor types.
    @Inject(UsersRepository) private readonly usersRepository: UsersRepository,
    @Inject(SignInsRepository) private readonly signIns: SignInsRepository,
    @Inject(AuthenticationRegistry) registry: AuthenticationRegistry,
  ) {
    // The key, issuer and audience come from the `accessToken` options.
    // `realm` goes into the WWW-Authenticate header of a 401.
    super({ realm: "dudesphere" });
    registry.registerProvider(this);
  }

  // Called after the signature and claims checked out. Returning null
  // rejects the token with a 401.
  async validate({ sub, iat, sid, amr }: JwtClaims): Promise<User | null> {
    if (!sub || !USER_ID.test(sub) || Number(sub) > MAX_USER_ID || typeof iat !== "number") {
      return null;
    }
    // The two reads run side by side, so the sign-in check costs no extra
    // wait. A soft-deleted member is not found, so closing an account ends
    // its tokens at once.
    const [user, signInIsLive] = await Promise.all([
      this.usersRepository.findById(Number(sub)),
      this.signInIsLive(sid, amr),
    ]);
    if (!user || !signInIsLive || !signedAfterPasswordChange(iat, user.passwordChangedAt)) {
      return null;
    }
    return user;
  }

  // Every sign-in token carries a `sid`. A token without one passes only if
  // it is a dev token, which belongs to no sign-in. Only the app's key can
  // sign either, and a dev token still ends with the account or the
  // password.
  private signInIsLive(sid: unknown, amr: unknown): Promise<boolean> {
    if (sid === undefined) {
      return Promise.resolve(Array.isArray(amr) && amr.length === 1 && amr[0] === DEV_TOKEN_AMR);
    }
    if (typeof sid !== "string" || !SID.test(sid)) {
      return Promise.resolve(false);
    }
    return this.signIns.isLive(sid);
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
