import { applyDecorators, SetMetadata } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

/** The key @ThrottleByAccount() writes. AuthThrottlerGuard, in this folder, reads it. */
export const THROTTLE_ACCOUNT_FIELD_KEY = "throttleAccountField";

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
 * `limit` is how many requests one account may make from one address, and
 * `ttl` is the time they are counted over, in milliseconds. Write the time
 * with `minutes()` or `days()` from @nestjs/throttler.
 *
 * Use it on a route that checks a password or sends an email. A tight limit
 * by IP alone is too coarse there: everyone behind one office address would
 * share five login attempts.
 *
 * It does two things, so a route needs no `@Throttle` of its own: it stores
 * the field name for AuthThrottlerGuard, and it sets the limit of the
 * "account" count on this route through `@Throttle`.
 *
 * The route keeps its limit by IP address as well, the 100 a minute every
 * route has. That one stops a caller who names a new account each time.
 */
export function ThrottleByAccount(field: string, { limit, ttl }: { limit: number; ttl: number }) {
  return applyDecorators(
    SetMetadata(THROTTLE_ACCOUNT_FIELD_KEY, field),
    Throttle({ [ACCOUNT_THROTTLER]: { limit, ttl } }),
  );
}
