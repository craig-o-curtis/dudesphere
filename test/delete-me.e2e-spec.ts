import { randomUUID } from "node:crypto";

import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types.js";

import { configureApp } from "./../src/app-setup.js";
import { AppModule } from "./../src/app.module.js";

// Needs the databases running. Creates a throwaway user and soft-deletes it,
// so each run leaves one deleted user behind.
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
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("closes the caller's own account", async () => {
    // randomUUID, not Date.now(), which the gmt lint rules ban. 8 characters
    // keep the username under its 24-character limit.
    const tag = randomUUID().slice(0, 8);
    const credentials = { email: `e2e-${tag}@example.com`, password: "secret123" };

    await request(app.getHttpServer())
      .post("/users")
      .send({ ...credentials, username: `e2e-${tag}` })
      .expect(201);

    const login = await request(app.getHttpServer()).post("/auth").send(credentials).expect(201);
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
    await request(app.getHttpServer()).post("/auth").send(credentials).expect(401);

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
