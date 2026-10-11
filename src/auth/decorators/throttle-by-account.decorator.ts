import { SetMetadata } from "@nestjs/common";

import { THROTTLE_ACCOUNT_FIELD_KEY } from "../../shared/auth-metadata.js";

/**
 * The name of the second count AppModule gives ThrottlerModule. The first,
 * "default", counts every route by IP address. This one counts by account
 * and IP address together, on the routes that ask for it below.
 */
export const ACCOUNT_THROTTLER = "account";

/**
 * Adds a second rate limit to a route, counted per account and IP address
 * together. `field` is the body field that names the account: `identifier`
 * on login, `email` on forgot-password. AuthThrottlerGuard reads this.
 *
 * Use it on a route that checks a password or sends an email, and set the
 * limit with `@Throttle({ [ACCOUNT_THROTTLER]: { limit, ttl } })`. A tight
 * limit by IP alone is too coarse there: everyone behind one office address
 * would share five login attempts.
 *
 * The route keeps its limit by IP address as well, the 100 a minute every
 * route has. That one stops a caller who names a new account each time.
 */
export function ThrottleByAccount(field: string) {
  return SetMetadata(THROTTLE_ACCOUNT_FIELD_KEY, field);
}
