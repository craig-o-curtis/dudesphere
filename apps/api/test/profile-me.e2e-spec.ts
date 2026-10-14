import {
  AUTHENTICATION_MODULE_OPTIONS,
  type AuthenticationModuleOptions,
  JwtSigner,
} from "@nestjs/authentication";
import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types.js";

import { configureApp } from "./../src/app-setup.js";
import { AppModule } from "./../src/app.module.js";
import { UserRole } from "./../src/users/user.entity.js";
import { signedInAs } from "./auth-helpers.js";
import { listenOnLoopback } from "./listen-on-loopback.js";

// Needs the databases running. It signs up one throwaway e2e- member and
// reads their profile. test/global-setup.ts deletes them when the run ends.
//
// It used to sign in as the seeded admin. Every sign-in saves a refresh
// token row, and the admin is not an e2e- user, so the cleanup never removed
// that row. A member of its own leaves nothing behind.
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

  it("returns the profile of the member who signed in", async () => {
    const { token, userId } = await signedInAs(app, UserRole.USER);

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
    const { accessToken } = app.get<AuthenticationModuleOptions>(AUTHENTICATION_MODULE_OPTIONS);
    const token = new JwtSigner(accessToken!).sign({ sub: "2000000000" });

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
});
