import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types.js";

import { configureApp } from "./../src/app-setup.js";
import { AppModule } from "./../src/app.module.js";
import { listenOnLoopback } from "./listen-on-loopback.js";
import { signUp } from "./sign-up.js";

// Needs the databases running. Creates a throwaway user and soft-deletes it.
// test/global-setup.ts deletes the row when the run ends.
describe("DELETE /users/me (e2e)", () => {
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

  it("closes the caller's own account", async () => {
    const { sent } = await signUp(app);

    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ identifier: sent.email, password: sent.password })
      .expect(201);
    const { token } = login.body as { token: string };

    await request(app.getHttpServer())
      .delete("/users/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(204);

    // The account and its profile are gone, and the user can't log back in.
    await request(app.getHttpServer())
      .get("/profiles/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(404);
    await request(app.getHttpServer())
      .post("/auth/login")
      .send({ identifier: sent.email, password: sent.password })
      .expect(401);

    // The token is still valid until it expires, but it can no longer post.
    await request(app.getHttpServer())
      .post("/abidings")
      .set("Authorization", `Bearer ${token}`)
      .send({ message: "posted after deleting my account" })
      .expect(404);

    // A second delete with the same token finds nothing to delete.
    await request(app.getHttpServer())
      .delete("/users/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(404);
  });

  it("returns 401 without a token", async () => {
    await request(app.getHttpServer()).delete("/users/me").expect(401);
  });
});
