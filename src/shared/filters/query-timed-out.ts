import { RequestTimeoutException } from "@nestjs/common";

/** Postgres query_canceled: what a statement gets when it passes statement_timeout. */
export const QUERY_CANCELED = "57014";

/** MongoDB MaxTimeMSExpired: what the server answers when an operation passes its limit. */
export const MAX_TIME_EXPIRED = 50;

/**
 * The 408 a database filter answers with when the database gave up on a
 * query that ran too long.
 *
 * It is the same answer TimeoutInterceptor gives when a whole request runs
 * too long, and on purpose: all three limits are the same number, so which
 * one trips first is an accident of timing, and the caller should not see a
 * different status for it. The driver error rides along as `cause`.
 */
export function queryTimedOut(cause: unknown): RequestTimeoutException {
  return new RequestTimeoutException(undefined, { cause });
}
