import { SetMetadata } from "@nestjs/common";

import { THROTTLE_ACCOUNT_FIELD_KEY } from "../../shared/auth-metadata.js";

/**
 * Makes the rate limit on a route count per account and IP address together,
 * not per IP address alone. `field` is the body field that names the account:
 * `identifier` on login, `email` on forgot-password. AuthThrottlerGuard reads
 * this.
 *
 * Use it with @Throttle() on a route that checks a password or sends an
 * email. Counting by IP alone is too coarse there: everyone behind one office
 * address would share five login attempts.
 */
export function ThrottleByAccount(field: string) {
  return SetMetadata(THROTTLE_ACCOUNT_FIELD_KEY, field);
}
