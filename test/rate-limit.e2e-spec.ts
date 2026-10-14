import { randomUUID } from "node:crypto";

import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types.js";

import { configureApp } from "./../src/app-setup.js";
import { AppModule } from "./../src/app.module.js";
import throttleConfig from "./../src/config/throttle.config.js";
import { listenOnLoopback } from "./listen-on-loopback.js";
import { signUp } from "./sign-up.js";

// The only e2e file that runs with rate limiting on. vitest.config.e2e.ts
// turns it off for the suite, and this file turns it back on for its own app.
//
// The counts live in the app's memory, and this file builds its own app, so
// nothing here is carried over from another file or from an earlier run.
// Every identifier has a random tag, so no two tests share a count either.
//
// Needs the databases running. Creates one throwaway e2e- user.
// test/global-setup.ts deletes it when the run ends.
describe("Rate limiting (e2e)", () => {
  let app: INestApplication<App>;

  const tag = randomUUID().slice(0, 8);
  const password = "secret123";

  function login(identifier: string, withPassword = "not-the-password") {
    return request(app.getHttpServer())
      .post("/auth/token")
      .send({ identifier, password: withPassword });
  }

  // Sent one after another. Sent together, the order they are counted in
  // would not be the order they are checked in.
  async function failLogin(identifier: string, times: number) {
    for (let attempt = 0; attempt < times; attempt += 1) {
      await login(identifier).expect(401);
    }
  }

  const refused = {
    statusCode: 429,
    message: "Too many requests. Try again later.",
    error: "Too Many Requests",
    errorCode: "RATE_LIMITED",
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(throttleConfig.KEY)
      .useValue({ enabled: true })
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await listenOnLoopback(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe("login allows 5 tries in 15 minutes for one account", () => {
    it("answers 429 to the sixth, and says how long to wait", async () => {
      const identifier = `e2e-sixth-${tag}`;
      await failLogin(identifier, 5);

      const response = await login(identifier).expect(429);

      expect(response.body).toEqual(refused);
      // Seconds until the block ends: more than none, and no more than the
      // 15 minutes the limit covers.
      const retryAfter = Number(response.headers["retry-after"]);
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(15 * 60);
    });

    it("refuses the right password too, once the account is blocked", async () => {
      const username = `e2e-right-${tag}`;
      await signUp(app, { username, email: `${username}@example.com`, password });
      await failLogin(username, 5);

      await login(username, password).expect(429);
    });

    // Login ignores case, so these are one account. If they were counted
    // apart, every spelling would buy five more guesses.
    it("counts the same identifier in capitals as the same account", async () => {
      const identifier = `e2e-case-${tag}`;
      await failLogin(identifier, 5);

      await login(identifier.toUpperCase()).expect(429);
      await login(` ${identifier} `).expect(429);
    });

    it("still lets another account through from the same address", async () => {
      await failLogin(`e2e-blocked-${tag}`, 5);
      await login(`e2e-blocked-${tag}`).expect(429);

      await login(`e2e-other-${tag}`).expect(401);
    });

    // The username and the email are counted apart, because the limiter sees
    // only what was typed. That is 10 tries at one account, not 5.
    it("counts a username and an email apart", async () => {
      await failLogin(`e2e-two-${tag}`, 5);

      await login(`e2e-two-${tag}@example.com`).expect(401);
    });
  });

  // An address with no account, so nothing is sent. The limit counts the
  // request, not the email.
  describe("forgot-password allows 3 requests in 15 minutes for one email", () => {
    function forgot(email: string) {
      return request(app.getHttpServer()).post("/auth/password/forgot").send({ email });
    }

    it("answers 429 to the fourth", async () => {
      const email = `e2e-flood-${tag}@example.com`;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await forgot(email).expect(202);
      }

      const response = await forgot(email).expect(429);

      expect(response.body).toEqual(refused);
      expect(Number(response.headers["retry-after"])).toBeGreaterThan(0);
    });

    it("counts the same email in capitals as the same one", async () => {
      const email = `e2e-floodcase-${tag}@example.com`;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await forgot(email).expect(202);
      }

      await forgot(email.toUpperCase()).expect(429);
    });

    it("still lets another email through from the same address", async () => {
      await forgot(`e2e-floodother-${tag}@example.com`).expect(202);
    });

    // Not covered any more: one address naming a new email on each request.
    // The docs' AuthThrottlerGuard counts by email and address together
    // wherever the body names an account, so each email gets its own count,
    // and no count covers the address alone on these routes.
  });

  describe("a route with no limit of its own", () => {
    it("is not held to login's 5: ten requests in a row all pass", async () => {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await request(app.getHttpServer()).get("/hashtags").expect(200);
      }
    });

    it("says how much of the 100 a minute is left", async () => {
      const response = await request(app.getHttpServer()).get("/hashtags").expect(200);

      expect(response.headers["x-ratelimit-limit"]).toBe("100");
      expect(Number(response.headers["x-ratelimit-remaining"])).toBeLessThan(100);
    });
  });
});
