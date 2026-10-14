import { getUtcNow } from "@northguild/gmt";

import { ClockUnavailableException } from "../exceptions/clock-unavailable.exception.js";

// The one place that turns gmt's "" into an error. Every part of the app
// that needs the current time, or a time worked out from one, comes through
// here, so the check is written once.
//
// Temporary, with CLOCK_UNAVAILABLE. See ../error-codes.ts.

/**
 * The current time, as an ISO 8601 UTC string, from the app's clock.
 * Throws a 503 CLOCK_UNAVAILABLE when the clock cannot be read.
 */
export function utcNowOrThrow(): string {
  return orClockUnavailable(getUtcNow());
}

/**
 * `instant` as it came, or a 503 CLOCK_UNAVAILABLE when it is empty. For the
 * result of gmt arithmetic such as addUtc, which returns "" (or null, for
 * minUtc) when it is handed a time it cannot use.
 */
export function orClockUnavailable(instant: string | null): string {
  if (!instant) {
    throw new ClockUnavailableException();
  }
  return instant;
}
