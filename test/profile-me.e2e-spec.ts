import { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types.js";

import { configureApp } from "./../src/app-setup.js";
import { AppModule } from "./../src/app.module.js";
import { signIn } from "./auth-helpers.js";
import { listenOnLoopback } from "./listen-on-loopback.js";

// Needs the databases running and the admin user seeded (`pnpm seed:run`).
// It logs in as the admin from .env and only reads data.
describe("GET /profiles/me (e2e)", () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Same global pipes, filters and interceptor as main.ts, so this tests the
    // app that actually runs. See src/app-setup.ts.
    configureApp(app);
    await listenOnLoopback(app);
  });

  afterAll(async () => {
    await app.close();
  });

  // The seeded admin, by EMAIL and PASSWORD from .env.
  function login(): Promise<{ token: string; userId: number }> {
    return signIn(app, process.env.EMAIL ?? "", process.env.PASSWORD ?? "");
  }

  it("returns the profile of the user who logged in", async () => {
    const { token, userId } = await login();

    const response = await request(app.getHttpServer())
      .get("/profiles/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect((response.body as { userId: number }).userId).toBe(userId);
  });

  // The user comes from the token, not from a fixed id. A token for a user
  // who does not exist must not fall back to someone else's profile. The
  // guard looks the user up, finds nobody, and refuses the token.
  it("returns 401 for a token whose user does not exist", async () => {
    const token = await app.get(JwtService).signAsync({ sub: 2_000_000_000, username: "nobody" });

    await request(app.getHttpServer())
      .get("/profiles/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(401);
  });

  it("returns 401 without a token", async () => {
    await request(app.getHttpServer()).get("/profiles/me").expect(401);
  });

  it("returns 401 for a token this app did not sign", async () => {
    await request(app.getHttpServer())
      .get("/profiles/me")
      .set("Authorization", "Bearer MY_TOKEN")
      .expect(401);
  });

  it("returns 401 when the password is wrong", async () => {
    await request(app.getHttpServer())
      .post("/auth/token")
      .send({ identifier: process.env.EMAIL, password: "not-the-password" })
      .expect(401);
  });
});
