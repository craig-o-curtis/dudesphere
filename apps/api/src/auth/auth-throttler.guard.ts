import { timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

import { ExecutionContext, HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  normalizeIp,
  ThrottlerGuard,
  type ThrottlerLimitDetail,
  type ThrottlerModuleOptions,
  type ThrottlerRequest,
  type ThrottlerStorage,
} from "@nestjs/throttler";

import throttleConfig from "../config/throttle.config.js";
import { ErrorCode } from "../shared/error-codes.js";

/**
 * The name of the second count, registered in AppModule beside the docs'
 * default one. It counts by IP address alone, on requests whose body names
 * an account. See AuthThrottlerGuard.
 */
export const IP_THROTTLER = "ip";

/**
 * Per IP everywhere; per account and IP where the request body names an
 * account. The docs' AuthThrottlerGuard, from "Rate-limit sign-in" on
 * https://docs.nestjs.com/security/authentication, with four changes:
 *
 * - The account is `identifier` at POST /auth/token, where the docs sign in
 *   with `email`, and `email` everywhere else.
 * - A per-IP cap on the routes that name an account. In the docs' guard,
 *   such a request is counted only for its account and IP together, so one
 *   address that names a new account each time is never refused: it can try
 *   one password against every account, or flood every inbox with reset
 *   links. The IP_THROTTLER count closes that. It holds one address to 100
 *   requests a minute on those routes, however many accounts it names.
 * - A refused request gets a 429 with errorCode RATE_LIMITED, like every
 *   other error here, and a Retry-After header saying how many seconds to
 *   wait.
 * - The IP address is the visitor's when the web app vouches for it. Behind
 *   the web app every request comes from the web server's address, so one
 *   visitor could use up everyone's limit. The web app sends the visitor's
 *   IP in X-Client-Ip, beside X-Bff-Secret. See clientIp below.
 *
 * Registered in AppModule, so it runs before the authentication guard, and
 * guessed bearer tokens count against the limit too.
 */
@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  // The docs' guard has no constructor and inherits ThrottlerGuard's. Here
  // each token is named outright: @nestjs/throttler's own metadata names a
  // Reflector the app cannot resolve, so without this the app fails to start.
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    @Inject(Reflector) reflector: Reflector,
    @Inject(throttleConfig.KEY)
    private readonly throttle: ConfigType<typeof throttleConfig>,
  ) {
    super(options, storageService, reflector);
  }

  // Called once for each count, for each request. The default count goes
  // through as the docs have it. The IP count runs only where the body names
  // an account, and counts by IP address alone. Where no account is named,
  // the default count is already one by IP address, and a second would only
  // count the same requests twice.
  protected override handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    if (requestProps.throttler.name !== IP_THROTTLER) {
      return super.handleRequest(requestProps);
    }
    const { req } = this.getRequestResponse(requestProps.context);
    if (!accountNamedIn(req.body)) {
      return Promise.resolve(true);
    }
    return super.handleRequest({
      ...requestProps,
      getTracker: (request: Record<string, any>) => this.clientIp(request),
    });
  }

  // The docs' tracker: the account and the IP address together where the
  // body names an account, and the IP address alone everywhere else.
  protected override async getTracker(req: Record<string, any>): Promise<string> {
    const ip = await this.clientIp(req);
    const account = accountNamedIn(req.body);
    return account ? `${account}|${ip}` : ip;
  }

  // The IP address both counts go by. The visitor's, from X-Client-Ip, when
  // X-Bff-Secret matches BFF_SECRET and the header holds an IP address.
  // Otherwise the caller's own, as ThrottlerGuard reads it. A wrong or
  // missing secret falls back without an error, so a browser that forges
  // X-Client-Ip is counted by its own address.
  //
  // The visitor's IP goes through normalizeIp, as the caller's own does in
  // ThrottlerGuard, so an IPv6 address is counted by its /64 either way.
  private async clientIp(req: Record<string, any>): Promise<string> {
    const vouchedFor = vouchedForIp(req.headers, this.throttle.bffSecret);
    return vouchedFor ? normalizeIp(vouchedFor, this.ipv6SubnetPrefix) : super.getTracker(req);
  }

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

// The IP address in X-Client-Ip, when X-Bff-Secret matches the secret and
// the header holds an IP address and nothing else. Otherwise undefined.
// The check on the address means even a leaked secret cannot put "|" or
// other text into a count's key.
function vouchedForIp(headers: unknown, bffSecret: string | undefined): string | undefined {
  if (!bffSecret || typeof headers !== "object" || headers === null) {
    return undefined;
  }
  const { "x-bff-secret": sent, "x-client-ip": clientIp } = headers as Record<string, unknown>;
  if (typeof sent !== "string" || !sameSecret(sent, bffSecret)) {
    return undefined;
  }
  return typeof clientIp === "string" && isIP(clientIp) !== 0 ? clientIp : undefined;
}

// Compares in constant time, so how long the answer takes says nothing
// about how much of the secret was right. timingSafeEqual throws on two
// buffers of different lengths, so those are refused first. The lengths
// are compared in bytes: "é" is one character but two bytes.
function sameSecret(sent: string, secret: string): boolean {
  const sentBytes = Buffer.from(sent);
  const secretBytes = Buffer.from(secret);
  return sentBytes.length === secretBytes.length && timingSafeEqual(sentBytes, secretBytes);
}

// The account the body names, folded the way the database compares it:
// trimmed, in Unicode NFC, and lowercased, so "Ada@Example.com " and
// "ada@example.com" share one count. The Turkish dotted capital I is mapped
// to "i" first, because toLowerCase() turns it into two characters.
function accountNamedIn(body: unknown): string {
  if (typeof body !== "object" || body === null) {
    return "";
  }
  const { identifier, email } = body as Record<string, unknown>;
  const value = typeof identifier === "string" ? identifier : email;
  return typeof value === "string"
    ? value.trim().normalize("NFC").replace(/İ/g, "i").toLowerCase()
    : "";
}
