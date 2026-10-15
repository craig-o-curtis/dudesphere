import "server-only";
import { createHash } from "node:crypto";

import type { TokenPair } from "@dudesphere/api-types";

import { apiFetch } from "@/lib/api";

// One refresh at a time, per refresh token, on this server instance.
//
// Nest's refresh tokens work once. If the same token reaches Nest twice, Nest
// treats it as stolen and ends the whole sign-in, with no grace period
// (TokenService.refresh in @nestjs/authentication). Two tabs, or a page and
// its client fetch, can easily send the same old cookie at the same moment.
// So every caller with the same token shares one call to Nest.
//
// Two instances can still race. The loser gets 401 "reused", and the member
// signs in again. The spec accepts that for now.

/**
 * How long a settled pair stays in the Map, in milliseconds.
 *
 * A second tab can arrive just after the first one finished, still carrying
 * the old refresh cookie. If the entry went the moment Nest answered, that
 * tab would send the spent token to Nest, which would end the sign-in for
 * both. Holding the pair for 10 seconds hands that tab the same pair instead.
 *
 * The cost: someone who replays the old token on this instance within those
 * 10 seconds also gets the new pair. The spec accepts that.
 */
export const SETTLED_PAIR_HOLD_MS = 10_000;

// Keyed by the SHA-256 hex of the refresh token, never the token itself, so
// a heap dump or a stray log of the Map holds nothing anyone can use.
const refreshes = new Map<string, Promise<TokenPair>>();

function keyOf(refreshToken: string): string {
  return createHash("sha256").update(refreshToken).digest("hex");
}

// Removes the entry only if it is still this promise. A later refresh for the
// same token may have taken the slot since.
function forget(key: string, promise: Promise<TokenPair>): void {
  if (refreshes.get(key) === promise) {
    refreshes.delete(key);
  }
}

function forgetAfterHold(key: string, promise: Promise<TokenPair>): void {
  const timer = setTimeout(forget, SETTLED_PAIR_HOLD_MS, key, promise);
  // A pending timer would keep a Node process alive, such as a test run or a
  // server that is shutting down. The hold is only an optimisation.
  timer.unref?.();
}

/**
 * Swaps a refresh token for a fresh pair at Nest's POST /auth/token/refresh.
 *
 * Every call with the same token while Nest is answering, and for
 * SETTLED_PAIR_HOLD_MS after it answered, gets the same promise, so Nest sees
 * the token once. A failure is dropped at once, so the next call asks Nest
 * again.
 *
 * Rejects with apiFetch's ApiRequestError: status 401 when Nest refused the
 * token, and status 0 when Nest didn't answer.
 */
export function refreshOnce(refreshToken: string): Promise<TokenPair> {
  const key = keyOf(refreshToken);
  const pending = refreshes.get(key);
  if (pending) {
    return pending;
  }

  const promise = apiFetch<TokenPair>("/auth/token/refresh", {
    method: "POST",
    body: { refreshToken },
  });
  refreshes.set(key, promise);
  // Both handlers return nothing and never throw, so this chain never
  // rejects. Callers see the failure on `promise` itself.
  promise.then(
    () => forgetAfterHold(key, promise),
    () => forget(key, promise),
  );
  return promise;
}
