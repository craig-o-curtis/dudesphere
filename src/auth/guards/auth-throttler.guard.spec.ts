import { ExecutionContext, HttpException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { ThrottlerRequest, ThrottlerStorage } from "@nestjs/throttler";

import {
  ACCOUNT_THROTTLER,
  ThrottleByAccount,
} from "../decorators/throttle-by-account.decorator.js";
import { AuthThrottlerGuard } from "./auth-throttler.guard.js";

// handleRequest and throwThrottlingException are protected, because only
// ThrottlerGuard calls them. This opens them to the spec and adds nothing.
class GuardUnderTest extends AuthThrottlerGuard {
  count(requestProps: ThrottlerRequest): Promise<boolean> {
    return this.handleRequest(requestProps);
  }

  refuse(context: ExecutionContext, timeToBlockExpire: number): Promise<void> {
    return this.throwThrottlingException(context, {
      limit: 5,
      ttl: 900_000,
      key: "a-key",
      tracker: "a-tracker",
      totalHits: 6,
      timeToExpire: timeToBlockExpire,
      isBlocked: true,
      timeToBlockExpire,
    });
  }
}

// Stand-ins for two routes: one that names its account field, one that does not.
class Routes {
  @ThrottleByAccount("identifier")
  login(this: void) {}

  @ThrottleByAccount("email")
  forgotPassword(this: void) {}

  anyOtherRoute(this: void) {}
}

describe("AuthThrottlerGuard", () => {
  // The store that keeps the counts. The fake records the key each request
  // was counted under and never blocks.
  const storage = { increment: vi.fn() };
  const guard = new GuardUnderTest(
    [{ ttl: 60_000, limit: 100 }],
    storage as unknown as ThrottlerStorage,
    new Reflector(),
  );
  const routes = new Routes();
  const response = { header: vi.fn() };

  const ip = "203.0.113.7";

  function contextFor(handler: () => void, body: unknown): ExecutionContext {
    return {
      getHandler: () => handler,
      getClass: () => Routes,
      switchToHttp: () => ({ getRequest: () => ({ ip, body }), getResponse: () => response }),
    } as unknown as ExecutionContext;
  }

  // Runs one of the two counts for one request, the way ThrottlerGuard does,
  // and returns what the request was counted under. undefined means the
  // count was skipped.
  async function countedUnder(
    throttlerName: string,
    handler: () => void,
    body: unknown,
  ): Promise<string | undefined> {
    const passed = await guard.count({
      context: contextFor(handler, body),
      limit: 5,
      ttl: 60_000,
      blockDuration: 60_000,
      throttler: { name: throttlerName, limit: 5, ttl: 60_000 },
      // What ThrottlerGuard passes for a count with no tracker of its own.
      getTracker: (req) => (req as { ip: string }).ip,
      // The real one hashes the tracker with the route's name. This keeps the
      // tracker readable.
      generateKey: (_context, tracker) => tracker,
    });
    expect(passed).toBe(true);

    const [call] = storage.increment.mock.calls as [string][];
    return call?.[0];
  }

  beforeAll(async () => {
    await guard.onModuleInit();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    storage.increment.mockResolvedValue({
      totalHits: 1,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });

  describe("the count by IP address", () => {
    it("counts a route that names no account field under the IP address", async () => {
      await expect(countedUnder("default", routes.anyOtherRoute, { message: "hi" })).resolves.toBe(
        ip,
      );
    });

    // Without this, a caller who named a new account on every try would
    // never be counted by address at all.
    it("counts login under the IP address alone, whatever account is named", async () => {
      await expect(countedUnder("default", routes.login, { identifier: "walter" })).resolves.toBe(
        ip,
      );
      await expect(countedUnder("default", routes.login, { identifier: "donny" })).resolves.toBe(
        ip,
      );
    });
  });

  describe("the count by account", () => {
    it("is skipped on a route that names no account field", async () => {
      await expect(
        countedUnder(ACCOUNT_THROTTLER, routes.anyOtherRoute, { message: "hi" }),
      ).resolves.toBeUndefined();
    });

    it("is the account and the IP address together on login", async () => {
      await expect(
        countedUnder(ACCOUNT_THROTTLER, routes.login, { identifier: "walter" }),
      ).resolves.toBe(`walter|${ip}`);
    });

    it("reads the field the route named, so forgot-password counts by email", async () => {
      await expect(
        countedUnder(ACCOUNT_THROTTLER, routes.forgotPassword, { email: "w@x.com" }),
      ).resolves.toBe(`w@x.com|${ip}`);
    });

    // Login ignores case and outer spaces, so these are one account and must
    // share one count. Otherwise each spelling would get five more tries.
    it.each(["Walter", "WALTER", "  walter  ", "walter\n"])(
      "counts %j as walter",
      async (identifier) => {
        await expect(countedUnder(ACCOUNT_THROTTLER, routes.login, { identifier })).resolves.toBe(
          `walter|${ip}`,
        );
      },
    );

    // "é" as one character, and as "e" followed by a combining accent.
    it("counts two ways of typing the same letter as one account", async () => {
      const composed = await countedUnder(ACCOUNT_THROTTLER, routes.login, {
        identifier: "rené",
      });
      vi.clearAllMocks();
      const decomposed = await countedUnder(ACCOUNT_THROTTLER, routes.login, {
        identifier: "rené",
      });

      expect(composed).toBe(`rené|${ip}`);
      expect(decomposed).toBe(composed);
    });

    // Postgres reads a capital I with a dot as "i" when it compares the
    // citext columns, so "lebowskİ" logs in as "lebowski". JavaScript's
    // toLowerCase() alone would count the two apart.
    it("counts a capital I with a dot as i, the way Postgres does", async () => {
      await expect(
        countedUnder(ACCOUNT_THROTTLER, routes.login, { identifier: "lebowskİ" }),
      ).resolves.toBe(`lebowski|${ip}`);
    });

    // A caller must not be able to pick their own bucket. On a route that
    // did not ask for it, a body field changes nothing.
    it("ignores an email or identifier field on any other route", async () => {
      const body = { email: "fresh-each-time@x.com", identifier: "fresh-each-time" };

      await expect(
        countedUnder(ACCOUNT_THROTTLER, routes.anyOtherRoute, body),
      ).resolves.toBeUndefined();
      await expect(countedUnder("default", routes.anyOtherRoute, body)).resolves.toBe(ip);
    });

    it.each([
      ["no body", undefined],
      ["a body that is not an object", "identifier=walter"],
      ["a null body", null],
      ["no such field", { password: "secret1" }],
      ["a field that is not a string", { identifier: ["walter"] }],
      ["a field of only spaces", { identifier: "   " }],
    ])("falls back to the IP address alone for %s", async (_what, body) => {
      await expect(countedUnder(ACCOUNT_THROTTLER, routes.login, body)).resolves.toBe(ip);
    });
  });

  describe("the refusal", () => {
    it("is a 429 with RATE_LIMITED, in the same shape as every other error", async () => {
      const context = contextFor(routes.login, { identifier: "walter" });

      const thrown: unknown = await guard.refuse(context, 42).catch((error: unknown) => error);

      expect(thrown).toBeInstanceOf(HttpException);
      const exception = thrown as HttpException;
      expect(exception.getStatus()).toBe(429);
      expect(exception.errorCode).toBe("RATE_LIMITED");
      expect(exception.getResponse()).toEqual({
        statusCode: 429,
        message: "Too many requests. Try again later.",
        error: "Too Many Requests",
        errorCode: "RATE_LIMITED",
      });
    });

    // ThrottlerGuard would name it Retry-After-account for the account count.
    it("sets Retry-After, with the seconds until the block ends", async () => {
      const context = contextFor(routes.login, { identifier: "walter" });

      await guard.refuse(context, 42).catch(() => undefined);

      expect(response.header).toHaveBeenCalledWith("Retry-After", 42);
    });
  });
});
