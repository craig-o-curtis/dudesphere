import { inspect } from "node:util";

import { ArgumentsHost, Catch, HttpException, Logger } from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";

import { REQUEST_ID_HEADER } from "../middleware/request-id.middleware.js";

// The fields of the request the log line reads. Typed here, not imported
// from express, so the filter does not depend on one adapter.
interface RequestLike {
  method: string;
  originalUrl?: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  user?: { userId: number };
}

/**
 * The last filter every error reaches. It changes no response: Nest's
 * BaseExceptionFilter still writes the body, so the shape stays
 * { statusCode, message, error }. What it adds is one log line per server
 * fault that says which request failed, for whom, and under which request id.
 *
 * BaseExceptionFilter alone logs an unknown error's stack with no request
 * context, and never logs an HttpException, not even a 503. So:
 * - unknown error: this logs the context line, Base logs the stack;
 * - HttpException with status >= 500: this logs the context line and the
 *   `cause` stack, which is the only place a cause is ever read. With no
 *   cause it logs the exception's own stack;
 * - anything below 500 is the caller's problem and is not logged.
 *
 * Registered first in configureApp. Nest tries global filters last to first,
 * so the specific filters registered after this one get the error before it.
 * The specific filters extend this class, so their fall-through 500s get the
 * same log line.
 */
@Catch()
export class AllExceptionsFilter extends BaseExceptionFilter {
  // Named faultLogger, not logger: a subclass may declare its own private
  // logger, and TypeScript rejects two private fields with the same name.
  private readonly faultLogger = new Logger(AllExceptionsFilter.name);

  override catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() === "http" && this.isServerFault(exception)) {
      this.logFault(exception, host);
    }
    super.catch(exception, host);
  }

  private isServerFault(exception: unknown): boolean {
    if (exception instanceof HttpException) {
      return exception.getStatus() >= 500;
    }
    // body-parser errors (malformed JSON, body too large) carry their own
    // status, and Base answers with it. A 4xx one is the caller's problem.
    if (this.isHttpError(exception)) {
      return exception.statusCode >= 500;
    }
    return true;
  }

  private logFault(exception: unknown, host: ArgumentsHost): void {
    const request = host.switchToHttp().getRequest<RequestLike>();
    const route = `${request.method} ${request.originalUrl ?? request.url}`;
    const user = request.user?.userId ?? "anonymous";
    const requestId = request.headers[REQUEST_ID_HEADER] ?? "-";
    const message = exception instanceof Error ? exception.message : String(exception);

    this.faultLogger.error(
      `${route} failed for user ${user} (request ${String(requestId)}): ${message}`,
      this.traceOf(exception),
    );
  }

  // Base logs an unknown error itself, stack included, so only an
  // HttpException needs a trace from here: Base never logs those.
  private traceOf(exception: unknown): string | undefined {
    if (!(exception instanceof HttpException)) {
      return undefined;
    }
    const { cause } = exception;
    if (cause instanceof Error) {
      return cause.stack;
    }
    // No Error to take a stack from, so the exception's own stack says where
    // it was thrown. A cause that is not an Error (a thrown string, say) has
    // no stack of its own; its text is added so it is not lost.
    const thrownAt = exception.stack ?? exception.message;
    if (cause === undefined) {
      return thrownAt;
    }
    return `${thrownAt}\nCaused by: ${typeof cause === "string" ? cause : inspect(cause)}`;
  }
}
