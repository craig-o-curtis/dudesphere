import { ExecutionContext, HttpException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { ThrottlerStorage } from "@nestjs/throttler";

import { ThrottleByAccount } from "../decorators/throttle-by-account.decorator.js";
import { AuthThrottlerGuard } from "./auth-throttler.guard.js";

// getTracker and throwThrottlingException are protected, because only
// ThrottlerGuard calls them. This opens them to the spec and adds nothing.
class GuardUnderTest extends AuthThrottlerGuard {
  trackerFor(request: object, context?: ExecutionContext): Promise<string> {
    return this.getTracker(request, context);
  }

  refuse(): Promise<void> {
    return this.throwThrottlingException();
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

function contextFor(handler: () => void): ExecutionContext {
  return { getHandler: () => handler } as unknown as ExecutionContext;
}

describe("AuthThrottlerGuard", () => {
  const guard = new GuardUnderTest(
    [{ ttl: 60_000, limit: 100 }],
    {} as ThrottlerStorage,
    new Reflector(),
  );
  const routes = new Routes();
  const login = contextFor(routes.login);
  const forgotPassword = contextFor(routes.forgotPassword);
  const anyOtherRoute = contextFor(routes.anyOtherRoute);

  const ip = "203.0.113.7";

  describe("what a request is counted under", () => {
    it("is the IP address on a route that names no account field", async () => {
      await expect(guard.trackerFor({ ip, body: { message: "hi" } }, anyOtherRoute)).resolves.toBe(
        ip,
      );
    });

    it("is the account and the IP address together on login", async () => {
      await expect(guard.trackerFor({ ip, body: { identifier: "walter" } }, login)).resolves.toBe(
        `walter|${ip}`,
      );
    });

    it("reads the field the route named, so forgot-password counts by email", async () => {
      await expect(
        guard.trackerFor({ ip, body: { email: "w@x.com" } }, forgotPassword),
      ).resolves.toBe(`w@x.com|${ip}`);
    });

    // Login ignores case and outer spaces, so these are one account and must
    // share one count. Otherwise each spelling would get five more tries.
    it.each(["Walter", "WALTER", "  walter  ", "walter\n"])(
      "counts %j as walter",
      async (identifier) => {
        await expect(guard.trackerFor({ ip, body: { identifier } }, login)).resolves.toBe(
          `walter|${ip}`,
        );
      },
    );

    // "é" as one character, and as "e" followed by a combining accent.
    it("counts two ways of typing the same letter as one account", async () => {
      const composed = await guard.trackerFor({ ip, body: { identifier: "rené" } }, login);
      const decomposed = await guard.trackerFor({ ip, body: { identifier: "rené" } }, login);

      expect(decomposed).toBe(composed);
    });

    // A caller must not be able to pick their own bucket. On a route that
    // did not ask for it, a body field changes nothing.
    it("ignores an email or identifier field on any other route", async () => {
      const body = { email: "fresh-each-time@x.com", identifier: "fresh-each-time" };

      await expect(guard.trackerFor({ ip, body }, anyOtherRoute)).resolves.toBe(ip);
    });

    it.each([
      ["no body", undefined],
      ["a body that is not an object", "identifier=walter"],
      ["a null body", null],
      ["no such field", { password: "secret1" }],
      ["a field that is not a string", { identifier: ["walter"] }],
      ["a field of only spaces", { identifier: "   " }],
    ])("falls back to the IP address alone for %s", async (_what, body) => {
      await expect(guard.trackerFor({ ip, body }, login)).resolves.toBe(ip);
    });

    it("falls back to the IP address alone when it is given no context", async () => {
      await expect(guard.trackerFor({ ip, body: { identifier: "walter" } })).resolves.toBe(ip);
    });
  });

  describe("the refusal", () => {
    it("is a 429 with RATE_LIMITED, in the same shape as every other error", async () => {
      const thrown: unknown = await guard.refuse().catch((error: unknown) => error);

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
  });
});
