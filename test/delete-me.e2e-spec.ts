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
      .expect(200);
    const { accessToken: token } = login.body as { accessToken: string };

    await request(app.getHttpServer())
      .delete("/users/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(204);

    // The account is closed, so its token is refused at once: the guard
    // looks the user up on every request and no longer finds one. The user
    // can't log back in either.
    await request(app.getHttpServer())
      .get("/profiles/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(401);
    await request(app.getHttpServer())
      .post("/auth/login")
      .send({ identifier: sent.email, password: sent.password })
      .expect(401);

    // It has not expired yet, and it still cannot post.
    await request(app.getHttpServer())
      .post("/abidings")
      .set("Authorization", `Bearer ${token}`)
      .send({ message: "posted after deleting my account" })
      .expect(401);

    // Nor delete the account a second time.
    await request(app.getHttpServer())
      .delete("/users/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(401);

    // It was not only the routes that read the user. A list that looks
    // nobody up is closed to it too.
    await request(app.getHttpServer())
      .get("/profiles")
      .set("Authorization", `Bearer ${token}`)
      .expect(401);
  });

  it("returns 401 without a token", async () => {
    await request(app.getHttpServer()).delete("/users/me").expect(401);
  });
});
