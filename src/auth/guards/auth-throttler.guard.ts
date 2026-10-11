import { ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { ThrottlerLimitDetail, ThrottlerRequest } from "@nestjs/throttler";

import { THROTTLE_ACCOUNT_FIELD_KEY } from "../../shared/auth-metadata.js";
import { ErrorCode } from "../../shared/error-codes.js";
import { ACCOUNT_THROTTLER } from "../decorators/throttle-by-account.decorator.js";

interface RequestWithBody {
  body?: unknown;
}

// The rate limiter. AppModule registers it as the first APP_GUARD, so it runs
// on every route and before JwtAuthGuard: a guessed bearer token counts
// against the limit too, and is not only turned away with a 401.
//
// It is ThrottlerGuard with two changes. It starts from the pattern in the
// Nest docs: https://docs.nestjs.com/security/authentication ("Rate-limit
// sign-in").
@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  // ThrottlerGuard calls this once for each count AppModule sets up.
  //
  // The "default" count goes straight through. It is by IP address, on every
  // route, login included.
  //
  // The "account" count runs only on a route marked @ThrottleByAccount(field).
  // There it counts the account named in that body field and the IP address
  // together. Every other route skips it.
  //
  // The docs keep one count and read `body.email` on every route. That has two
  // holes. A caller could add an `email` field to any request, change it each
  // time, and get a fresh count each time. And on login, a caller who names a
  // new account each time is never counted by address at all. So here a route
  // has to ask for the account count, and the count by address always runs
  // beside it.
  protected override handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    if (requestProps.throttler.name !== ACCOUNT_THROTTLER) {
      return super.handleRequest(requestProps);
    }

    const field = this.reflector.get<string | undefined>(
      THROTTLE_ACCOUNT_FIELD_KEY,
      requestProps.context.getHandler(),
    );
    if (!field) {
      return Promise.resolve(true);
    }

    return super.handleRequest({
      ...requestProps,
      getTracker: (req: RequestWithBody) => this.getAccountTracker(req, field),
    });
  }

  // What the "account" count files a request under: the account and the IP
  // address together, or the IP address alone when the body names no account.
  protected async getAccountTracker(req: RequestWithBody, field: string): Promise<string> {
    const ip = await this.getTracker(req);
    const account = accountNamedIn(req.body, field);
    return account ? `${account}|${ip}` : ip;
  }

  // A 429 in the same shape as every other error: { statusCode, message,
  // error, errorCode }.
  //
  // ThrottlerGuard names its header after the count that refused, so the
  // "account" count sets Retry-After-account. A client looks for Retry-After,
  // so that one is set here, whichever count refused.
  protected override throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const { res } = this.getRequestResponse(context);
    this.setResponseHeader(res, "Retry-After", throttlerLimitDetail.timeToBlockExpire);

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
//
// "İ" (a capital I with a dot) is turned into "i" first. Postgres compares the
// citext columns with its own lowercasing, which reads "İ" as "i". JavaScript's
// toLowerCase() gives "i" and a separate dot, which is different text. Without
// this, "lebowskİ" would log in as "lebowski" but be counted apart from it.
function accountNamedIn(body: unknown, field: string): string {
  if (typeof body !== "object" || body === null) {
    return "";
  }
  const value = (body as Record<string, unknown>)[field];
  return typeof value === "string"
    ? value.trim().normalize("NFC").replace(/İ/g, "i").toLowerCase()
    : "";
}
