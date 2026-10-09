import { CallHandler, ExecutionContext, Logger, NestInterceptor } from "@nestjs/common";
import type { Request } from "express";
import { catchError, Observable, throwError, timeout, TimeoutError } from "rxjs";

import { TimeLimitExceededException } from "../exceptions/time-limit-exceeded.exception.js";
import { REQUEST_ID_HEADER } from "../middleware/request-id.middleware.js";

/** How long a handler may take before the caller gets a 408. */
export const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Answers 408 when a handler takes longer than the limit, so a stuck query
 * cannot hold a request open forever. This is the TimeoutInterceptor from
 * https://docs.nestjs.com/interceptors, with the limit passed in and a log
 * line added.
 *
 * On its own it ends the wait, not the work: the handler keeps running after
 * the 408 goes out. Two database limits in src/app.module.ts do the stopping.
 * Postgres cancels a statement after the same number of milliseconds
 * (`statement_timeout`) and the Mongo driver stops an operation after the
 * same number (`timeoutMS`). A statement that had already finished is still
 * written, so a caller who gets a 408 cannot assume nothing happened.
 *
 * Not @Injectable(). configureApp creates it with `new`, and Nest would have
 * no way to inject the number.
 */
export class TimeoutInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TimeoutInterceptor.name);

  constructor(private readonly limitMs: number = REQUEST_TIMEOUT_MS) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      timeout(this.limitMs),
      catchError((error: unknown) => {
        if (!(error instanceof TimeoutError)) {
          return throwError(() => error);
        }
        // A 408 is below 500, so AllExceptionsFilter stays silent on it.
        // Logged here, or a slow handler would leave no trace at all.
        if (context.getType() === "http") {
          const request = context.switchToHttp().getRequest<Request>();
          const requestId = request.headers[REQUEST_ID_HEADER] ?? "-";
          this.logger.warn(
            `${request.method} ${request.originalUrl} timed out after ${this.limitMs} ms ` +
              `(request ${String(requestId)})`,
          );
        }
        return throwError(() => new TimeLimitExceededException(error));
      }),
    );
  }
}
