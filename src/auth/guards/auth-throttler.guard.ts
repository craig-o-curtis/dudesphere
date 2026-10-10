import { ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

import { THROTTLE_ACCOUNT_FIELD_KEY } from "../../shared/auth-metadata.js";
import { ErrorCode } from "../../shared/error-codes.js";

interface RequestWithBody {
  body?: unknown;
}

// The rate limiter. AppModule registers it as the first APP_GUARD, so it runs
// on every route and before JwtAuthGuard: a guessed bearer token counts
// against the limit too, and is not only turned away with a 401.
//
// It is ThrottlerGuard with two changes. The pattern is the one in the Nest
// docs: https://docs.nestjs.com/security/authentication ("Rate-limit sign-in").
@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  // What a request is counted under. Everywhere, that is the caller's IP
  // address. On a route marked @ThrottleByAccount(field), it is the account
  // named in that body field and the IP address together.
  //
  // The docs read `body.email` on every route. Here a route has to ask for
  // it. Otherwise a caller could add an `email` field to any request, change
  // it each time, and get a fresh count each time, which steps around the
  // per-address limit.
  //
  // ThrottlerGuard calls this with the context as a second argument, though
  // its own signature does not show one.
  protected override async getTracker(
    req: RequestWithBody,
    context?: ExecutionContext,
  ): Promise<string> {
    const ip = await super.getTracker(req);
    const field = context
      ? this.reflector.get<string | undefined>(THROTTLE_ACCOUNT_FIELD_KEY, context.getHandler())
      : undefined;
    const account = field ? accountNamedIn(req.body, field) : "";
    return account ? `${account}|${ip}` : ip;
  }

  // A 429 in the same shape as every other error: { statusCode, message,
  // error, errorCode }. ThrottlerGuard has already set the Retry-After header
  // by the time it calls this.
  protected override throwThrottlingException(): Promise<void> {
    return Promise.reject(
      new HttpException(
        HttpException.createBody(
          "Too many requests. Try again later.",
          "Too Many Requests",
          HttpStatus.TOO_MANY_REQUESTS,
          ErrorCode.RATE_LIMITED,
        ),
        HttpStatus.TOO_MANY_REQUESTS,
        { errorCode: ErrorCode.RATE_LIMITED },
      ),
    );
  }
}

// Trimmed and lowercased, the way login treats it: "Walter " and "walter" are
// one account, so they share one count. NFC, so a letter typed as one
// character and the same letter typed as two count as the same text.
function accountNamedIn(body: unknown, field: string): string {
  if (typeof body !== "object" || body === null) {
    return "";
  }
  const value = (body as Record<string, unknown>)[field];
  return typeof value === "string" ? value.trim().normalize("NFC").toLowerCase() : "";
}
