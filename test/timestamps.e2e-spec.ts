import { randomUUID } from "node:crypto";

import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import {
  areUtcEqual,
  diffUtc,
  getSystemTimeZone,
  getUtcNow,
  isAfterUtc,
  isValidUtc,
} from "@northguild/gmt";
import request from "supertest";
import type { App } from "supertest/types.js";

import { configureApp } from "./../src/app-setup.js";
import { AppModule } from "./../src/app.module.js";
import { listenOnLoopback } from "./listen-on-loopback.js";

// A timestamp has to mean the same instant on every machine.
//
// It once did not. The columns were `timestamp` with no time zone, the
// database clock wrote UTC into them, and the driver read them back in the
// zone of the machine the app ran on. On a machine three hours ahead of UTC,
// createdAt came back three hours early. The same columns never moved
// updatedAt at all.
//
// vitest.config.e2e.ts runs this suite in a zone far from UTC on purpose.
// In UTC the first bug cannot show.
//
// Needs the databases running. Creates one throwaway user per run and never
// changes its email, which the cleanup job in test/global-setup.ts relies on.
describe("Timestamps (e2e)", () => {
  let app: INestApplication<App>;
  let token: string;
  let user: { createdAt: string; updatedAt: string };

  // The database clock and this machine's clock are two clocks, so allow them
  // to differ a little. The bug this guards against was hours, not seconds.
  const CLOCK_SLACK_SECONDS = 120;

  function secondsFromNow(value: string) {
    return Math.abs(diffUtc(value, getUtcNow(), "seconds") as number);
  }

  function authed(method: "get" | "patch", path: string) {
    return request(app.getHttpServer())[method](path).set("Authorization", `Bearer ${token}`);
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Same global middleware, pipes and filters as main.ts. See src/app-setup.ts.
    configureApp(app);
    await listenOnLoopback(app);

    const name = randomUUID().replaceAll("-", "").slice(0, 8);
    const credentials = { email: `e2e-${name}@example.com`, password: "secret123" };
    const created = await request(app.getHttpServer())
      .post("/users")
      .send({ ...credentials, username: `e2e-${name}` })
      .expect(201);
    user = created.body as { createdAt: string; updatedAt: string };

    const login = await request(app.getHttpServer()).post("/auth").send(credentials).expect(201);
    token = (login.body as { token: string }).token;
  });

  afterAll(async () => {
    await app.close();
  });

  // Without this the suite could pass for the wrong reason. If the zone in
  // vitest.config.e2e.ts stopped taking effect, every test below would still
  // pass on a UTC machine and prove nothing.
  it("runs in a zone that is not UTC", () => {
    expect(getSystemTimeZone()).toBe("Asia/Tokyo");
  });

  it("returns a new user's createdAt as the instant it was created", () => {
    expect(isValidUtc(user.createdAt)).toBe(true);
    expect(secondsFromNow(user.createdAt)).toBeLessThan(CLOCK_SLACK_SECONDS);
  });

  it("returns a new profile's createdAt as the instant it was created", async () => {
    const { body } = await authed("get", "/profiles/me").expect(200);

    const profile = body as { createdAt: string };
    expect(isValidUtc(profile.createdAt)).toBe(true);
    expect(secondsFromNow(profile.createdAt)).toBeLessThan(CLOCK_SLACK_SECONDS);
  });

  it("moves a profile's updatedAt when the profile is edited", async () => {
    const { body } = await authed("patch", "/profiles/me").send({ bio: "abides" }).expect(200);

    const profile = body as { createdAt: string; updatedAt: string };
    expect(isAfterUtc(profile.updatedAt, profile.createdAt)).toBe(true);
    expect(secondsFromNow(profile.updatedAt)).toBeLessThan(CLOCK_SLACK_SECONDS);
  });

  it("moves a user's updatedAt when the user is edited", async () => {
    const renamed = `e2e-${randomUUID().replaceAll("-", "").slice(0, 8)}`;

    const { body } = await authed("patch", "/users/me").send({ username: renamed }).expect(200);

    const edited = body as { createdAt: string; updatedAt: string };
    expect(areUtcEqual(edited.createdAt, user.createdAt)).toBe(true);
    expect(isAfterUtc(edited.updatedAt, user.updatedAt)).toBe(true);
  });

  // The app writes this one itself. It used to be stored as the machine's
  // local wall time, which read back correctly only on that same machine.
  it("returns an ordainedDate as the same instant that was sent", async () => {
    const sent = "2026-10-06T12:00:00Z";

    const patched = await authed("patch", "/profiles/me").send({ ordainedDate: sent }).expect(200);
    const read = await authed("get", "/profiles/me").expect(200);

    expect(areUtcEqual((patched.body as { ordainedDate: string }).ordainedDate, sent)).toBe(true);
    expect(areUtcEqual((read.body as { ordainedDate: string }).ordainedDate, sent)).toBe(true);
  });
});
