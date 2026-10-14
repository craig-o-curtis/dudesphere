import { RequestTimeoutException } from "@nestjs/common";

/**
 * The work took longer than a request is allowed. A 408.
 *
 * Three limits are set to the same number: the request (TimeoutInterceptor),
 * each Postgres statement (statement_timeout) and each Mongo operation
 * (timeoutMS). Which one trips first is an accident of timing, so all three
 * answer with this one class and the caller sees one status for "too slow".
 *
 * Pass what tripped the limit as the cause: the driver error, or RxJS's
 * TimeoutError.
 */
export class TimeLimitExceededException extends RequestTimeoutException {
  constructor(cause: unknown) {
    super(undefined, { cause });
  }
}
