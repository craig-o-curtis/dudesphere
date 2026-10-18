import { ExecutionContext, HttpException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { ThrottlerStorage } from "@nestjs/throttler";

import { AuthThrottlerGuard, IP_THROTTLER } from "./auth-throttler.guard.js";

// The guard's rate-limit settings, as throttle.config.ts gives them. No
// BFF_SECRET, so X-Client-Ip is never trusted.
const noSecret = { enabled: true, bffSecret: undefined };

// getTracker is protected, because only ThrottlerGuard calls it. This opens
// it to the spec and adds nothing.
class GuardUnderTest extends AuthThrottlerGuard {
  trackerFor(req: Record<string, unknown>): Promise<string> {
    return this.getTracker(req);
  }
}

// A stand-in for a controller, so the guard has a class and a handler to
// read throttle settings from. It has none, so the defaults apply.
class Routes {
  anyRoute(this: void) {}
}

describe("AuthThrottlerGuard", () => {
  // The store that keeps the counts. The fake records each key it was asked
  // to count, and never blocks unless a test says so.
  const storage = { increment: vi.fn() };
  const guard = new GuardUnderTest(
    [{ ttl: 60_000, limit: 100 }],
    storage as unknown as ThrottlerStorage,
    new Reflector(),
    noSecret,
  );
  const response = { header: vi.fn() };

  const ip = "203.0.113.7";
  // The address the BFF calls from: the web server's, not the visitor's.
  const webServer = "192.0.2.1";
  // Made up for this spec. 36 characters, so long enough for env.validate.ts.
  const bffSecret = "made-up-bff-secret-for-the-unit-spec";

  function contextFor(body: unknown, request: Record<string, unknown> = { ip }): ExecutionContext {
    return {
      getHandler: () => Routes.prototype.anyRoute,
      getClass: () => Routes,
      switchToHttp: () => ({
        getRequest: () => ({ ...request, body }),
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;
  }

  function trackerFor(body: unknown): Promise<string> {
    return guard.trackerFor({ ip, body });
  }

  // Runs the whole guard for one request, and returns the key the store
  // was asked to count it under.
  async function countedUnder(body: unknown): Promise<string> {
    await expect(guard.canActivate(contextFor(body))).resolves.toBe(true);
    const [call] = storage.increment.mock.calls as [string][];
    vi.clearAllMocks();
    return call[0];
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

  describe("the tracker", () => {
    it("is the IP address alone when the body names no account", async () => {
      await expect(trackerFor({ message: "hi" })).resolves.toBe(ip);
    });

    // POST /auth/token names the account in `identifier`.
    it("is the identifier and the IP address together", async () => {
      await expect(trackerFor({ identifier: "walter", password: "secret1" })).resolves.toBe(
        `walter|${ip}`,
      );
    });

    // POST /auth/password/forgot names it in `email`.
    it("is the email and the IP address together", async () => {
      await expect(trackerFor({ email: "walter@example.com" })).resolves.toBe(
        `walter@example.com|${ip}`,
      );
    });

    it("prefers the identifier when the body has both", async () => {
      await expect(trackerFor({ identifier: "walter", email: "donny@example.com" })).resolves.toBe(
        `walter|${ip}`,
      );
    });

    // A caller who sends a non-string identifier must not dodge the count
    // by email, nor the other way round.
    it("falls back to the email when the identifier is not a string", async () => {
      await expect(
        trackerFor({ identifier: ["walter"], email: "walter@example.com" }),
      ).resolves.toBe(`walter@example.com|${ip}`);
    });

    // Sign-in ignores case and outer spaces, so these are one account and
    // must share one count. Otherwise each spelling would get five more tries.
    it.each(["Walter", "WALTER", "  walter  ", "walter\n"])(
      "counts %j as walter",
      async (identifier) => {
        await expect(trackerFor({ identifier })).resolves.toBe(`walter|${ip}`);
      },
    );

    it("counts an email in any case as one account", async () => {
      await expect(trackerFor({ email: " Walter@Example.COM " })).resolves.toBe(
        `walter@example.com|${ip}`,
      );
    });

    // "é" as one character, and as "e" followed by a combining accent.
    it("counts two ways of typing the same letter as one account", async () => {
      const composed = await trackerFor({ identifier: "rené" });
      const decomposed = await trackerFor({ identifier: "rené" });

      expect(composed).toBe(`rené|${ip}`);
      expect(decomposed).toBe(composed);
    });

    // Postgres reads a capital I with a dot as "i" when it compares the
    // citext columns, so "lebowskİ" signs in as "lebowski". JavaScript's
    // toLowerCase() alone would count the two apart.
    it("counts a capital I with a dot as i, the way Postgres does", async () => {
      await expect(trackerFor({ identifier: "lebowskİ" })).resolves.toBe(`lebowski|${ip}`);
    });

    it.each([
      ["no body", undefined],
      ["a body that is not an object", "identifier=walter"],
      ["a null body", null],
      ["no such field", { password: "secret1" }],
      ["fields that are not strings", { identifier: ["walter"], email: 42 }],
      ["a field of only spaces", { identifier: "   " }],
      ["an empty field", { identifier: "" }],
    ])("is the IP address alone for %s", async (_what, body) => {
      await expect(trackerFor(body)).resolves.toBe(ip);
    });
  });

  describe("the count", () => {
    // Proves the guard really counts by the tracker above, and not only by
    // address.
    it("keeps one count for each account at one address", async () => {
      const walter = await countedUnder({ identifier: "walter" });
      const walterAgain = await countedUnder({ identifier: " WALTER " });
      const donny = await countedUnder({ identifier: "donny" });

      expect(walterAgain).toBe(walter);
      expect(donny).not.toBe(walter);
    });
  });

  // AppModule registers two counts: the docs' default, and IP_THROTTLER, a
  // cap by IP address alone on the routes that name an account.
  describe("the IP count", () => {
    const twoCounts = new GuardUnderTest(
      [
        { ttl: 60_000, limit: 100 },
        { name: IP_THROTTLER, ttl: 60_000, limit: 100 },
      ],
      storage as unknown as ThrottlerStorage,
      new Reflector(),
      { enabled: true, bffSecret },
    );

    beforeAll(async () => {
      await twoCounts.onModuleInit();
    });

    // Each count the store was asked for, as [key, count name].
    async function countsFor(
      body: unknown,
      request?: Record<string, unknown>,
    ): Promise<[string, string][]> {
      await expect(twoCounts.canActivate(contextFor(body, request))).resolves.toBe(true);
      const calls = (storage.increment.mock.calls as unknown[][]).map(
        ([key, , , , name]) => [key, name] as [string, string],
      );
      vi.clearAllMocks();
      return calls;
    }

    it("counts a request that names an account twice: by account, and by address", async () => {
      const counts = await countsFor({ email: "walter@example.com" });

      expect(counts.map(([, name]) => name)).toEqual(["default", IP_THROTTLER]);
    });

    // Without this, an address that named a new account each time would
    // never be refused.
    it("keeps one IP count for an address, whatever account it names", async () => {
      const walter = await countsFor({ email: "walter@example.com" });
      const donny = await countsFor({ email: "donny@example.com" });

      expect(donny[1][0]).toBe(walter[1][0]);
      expect(donny[0][0]).not.toBe(walter[0][0]);
    });

    // The default count is already by address there, so a second would
    // count the same request twice.
    it("skips a request that names no account", async () => {
      const counts = await countsFor({ message: "hi" });

      expect(counts.map(([, name]) => name)).toEqual(["default"]);
    });

    // Behind the BFF every request comes from the web server's address. If
    // the IP count used that address, one visitor could use up everyone's.
    it("counts the visitor's IP from the BFF, not the web server's", async () => {
      const body = { email: "walter@example.com" };
      const throughTheBff = await countsFor(body, {
        ip: webServer,
        headers: { "x-bff-secret": bffSecret, "x-client-ip": ip },
      });
      const fromTheVisitor = await countsFor(body, { ip });

      expect(throughTheBff[1][0]).toBe(fromTheVisitor[1][0]);
    });

    it("keeps two visitors behind one web server apart", async () => {
      const body = { email: "walter@example.com" };
      const walter = await countsFor(body, {
        ip: webServer,
        headers: { "x-bff-secret": bffSecret, "x-client-ip": ip },
      });
      const donny = await countsFor(body, {
        ip: webServer,
        headers: { "x-bff-secret": bffSecret, "x-client-ip": "198.51.100.2" },
      });

      expect(donny[1][0]).not.toBe(walter[1][0]);
    });
  });

  // The web app sends X-Bff-Secret and X-Client-Ip on every call. The guard
  // trusts the IP only when the secret matches BFF_SECRET, and only when it
  // is an IP address. Otherwise it counts the caller's own address.
  describe("behind the BFF", () => {
    const behindTheBff = new GuardUnderTest(
      [{ ttl: 60_000, limit: 100 }],
      storage as unknown as ThrottlerStorage,
      new Reflector(),
      { enabled: true, bffSecret },
    );

    function throughTheBff(headers: Record<string, unknown>, body?: unknown): Promise<string> {
      return behindTheBff.trackerFor({ ip: webServer, headers, body });
    }

    it("is the visitor's IP when the secret matches", async () => {
      await expect(throughTheBff({ "x-bff-secret": bffSecret, "x-client-ip": ip })).resolves.toBe(
        ip,
      );
    });

    it("is the account and the visitor's IP when the body names an account", async () => {
      await expect(
        throughTheBff({ "x-bff-secret": bffSecret, "x-client-ip": ip }, { identifier: "walter" }),
      ).resolves.toBe(`walter|${ip}`);
    });

    // Even with the secret, the header can't put other text in the key.
    it.each(["not-an-ip", `${ip}|donny`, `${ip} `, "", ["203.0.113.7"]])(
      "is the caller's own address when X-Client-Ip is %j",
      async (clientIp) => {
        await expect(
          throughTheBff({ "x-bff-secret": bffSecret, "x-client-ip": clientIp }),
        ).resolves.toBe(webServer);
      },
    );

    it("is the caller's own address when the secret is wrong", async () => {
      const wrong = `${bffSecret.slice(0, -1)}X`;

      await expect(throughTheBff({ "x-bff-secret": wrong, "x-client-ip": ip })).resolves.toBe(
        webServer,
      );
    });

    it("is the caller's own address when the secret is missing", async () => {
      await expect(throughTheBff({ "x-client-ip": ip })).resolves.toBe(webServer);
    });

    // timingSafeEqual throws on two buffers of different lengths. A short or
    // long guess must fall back, not answer 500.
    it.each([
      ["shorter", bffSecret.slice(0, -1)],
      ["longer", `${bffSecret}X`],
      ["the same length in characters, but not in bytes", `${bffSecret.slice(0, -1)}é`],
    ])("is the caller's own address when the secret is %s", async (_what, secret) => {
      await expect(throughTheBff({ "x-bff-secret": secret, "x-client-ip": ip })).resolves.toBe(
        webServer,
      );
    });

    // No BFF_SECRET means the header is never trusted, whatever is sent.
    it("is the caller's own address when BFF_SECRET is not set", async () => {
      await expect(
        guard.trackerFor({
          ip: webServer,
          headers: { "x-bff-secret": bffSecret, "x-client-ip": ip },
        }),
      ).resolves.toBe(webServer);
    });

    // The guard's own tracker groups an IPv6 address by its /64, because one
    // home or phone often has a whole /64. The visitor's IP is grouped the
    // same way, so a visitor can't get a fresh count from each address in it.
    it("groups a visitor's IPv6 address by its /64, as for the caller's own", async () => {
      const visitor = await throughTheBff({
        "x-bff-secret": bffSecret,
        "x-client-ip": "2001:db8:1:2:3:4:5:6",
      });
      const sameNetwork = await throughTheBff({
        "x-bff-secret": bffSecret,
        "x-client-ip": "2001:db8:1:2:aaaa:bbbb:cccc:dddd",
      });

      expect(visitor).toBe("2001:db8:1:2::/64");
      expect(sameNetwork).toBe(visitor);
    });
  });

  describe("the refusal", () => {
    beforeEach(() => {
      storage.increment.mockResolvedValue({
        totalHits: 6,
        timeToExpire: 42,
        isBlocked: true,
        timeToBlockExpire: 42,
      });
    });

    it("is a 429 with RATE_LIMITED, in the same shape as every other error", async () => {
      const thrown: unknown = await guard
        .canActivate(contextFor({ identifier: "walter" }))
        .catch((error: unknown) => error);

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

    it("sets Retry-After, with the seconds until the block ends", async () => {
      await guard.canActivate(contextFor({ identifier: "walter" })).catch(() => undefined);

      expect(response.header).toHaveBeenCalledWith("Retry-After", 42);
    });
  });
});
