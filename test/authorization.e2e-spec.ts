import { randomUUID } from "node:crypto";

import { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types.js";

import { configureApp } from "./../src/app-setup.js";
import { AppModule } from "./../src/app.module.js";
import { UserRole } from "./../src/users/user.entity.js";
import { listenOnLoopback } from "./listen-on-loopback.js";

// The only place the guards are proved over real HTTP. A unit controller spec
// cannot do it: both guards are APP_GUARDs registered in AppModule, and
// Test.createTestingModule({ controllers: [...] }) never registers those, so a
// 401 or 403 is unreachable there.
//
// Needs the databases running and the admin user seeded (`pnpm seed:run`).
// Creates two throwaway users and one abiding, so each run leaves those behind.
describe("Authorization (e2e)", () => {
  let app: INestApplication<App>;
  let jwt: JwtService;

  // A plain user, and a second one to be the stranger in the ownership cases.
  let owner: { token: string; userId: number };
  let stranger: { token: string; userId: number };
  let adminToken: string;
  let ownersAbidingId: string;

  const registerAndLogin = async (): Promise<{ token: string; userId: number }> => {
    // randomUUID, not Date.now(), which the gmt lint rules ban. 8 characters
    // keep the username under its 24-character limit.
    const tag = randomUUID().slice(0, 8);
    const credentials = { email: `e2e-${tag}@example.com`, password: "secret123" };

    await request(app.getHttpServer())
      .post("/users")
      .send({ ...credentials, username: `e2e-${tag}` })
      .expect(201);

    const login = await request(app.getHttpServer()).post("/auth").send(credentials).expect(201);
    const { token, userId } = login.body as { token: string; userId: number };
    return { token, userId };
  };

  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Same global pipes, filters and interceptor as main.ts, so this tests the
    // app that actually runs. See src/app-setup.ts.
    configureApp(app);
    await listenOnLoopback(app);
    jwt = app.get(JwtService);

    owner = await registerAndLogin();
    stranger = await registerAndLogin();

    // Signed here rather than logged in, so the suite does not depend on the
    // seeded admin's password. Same technique as profile-me.e2e-spec.ts.
    adminToken = await jwt.signAsync({
      sub: owner.userId,
      username: "e2e-admin",
      role: UserRole.ADMIN,
    });

    const posted = await request(app.getHttpServer())
      .post("/abidings")
      .set(bearer(owner.token))
      .send({ message: "the dude abides" })
      .expect(201);
    ownersAbidingId = (posted.body as { id: string }).id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe("public routes still need no token", () => {
    it.each([
      ["/", 200],
      ["/abidings", 200],
      ["/hashtags", 200],
      ["/profiles", 200],
    ] as const)("GET %s is %i", async (path, status) => {
      await request(app.getHttpServer()).get(path).expect(status);
    });

    // Both have to stay open or there is no way to get a first token.
    it("POST /auth and POST /users are reachable anonymously", async () => {
      await request(app.getHttpServer())
        .post("/auth")
        .send({ email: "nobody@example.com", password: "wrong" })
        .expect(401); // reached the handler, which rejected the credentials

      const tag = randomUUID().slice(0, 8);
      await request(app.getHttpServer())
        .post("/users")
        .send({ email: `e2e-${tag}@example.com`, password: "secret123", username: `e2e-${tag}` })
        .expect(201);
    });
  });

  describe("401 without a token", () => {
    it.each([
      ["get", "/users/me"],
      ["get", "/abidings/me"],
      ["get", "/profiles/me"],
      ["post", "/abidings"],
      ["get", "/users"],
    ] as const)("%s %s", async (method, path) => {
      await request(app.getHttpServer())[method](path).expect(401);
    });
  });

  // The first 403s this app has returned. Before the guard, the only role check
  // in the codebase threw 401 here by hand.
  describe("403 for a signed-in user on an admin route", () => {
    it("GET /users", async () => {
      await request(app.getHttpServer()).get("/users").set(bearer(owner.token)).expect(403);
    });

    it("PATCH /users/:id", async () => {
      await request(app.getHttpServer())
        .patch(`/users/${stranger.userId}`)
        .set(bearer(owner.token))
        .send({ username: "hijacked" })
        .expect(403);
    });

    it("DELETE /users/:id", async () => {
      await request(app.getHttpServer())
        .delete(`/users/${stranger.userId}`)
        .set(bearer(owner.token))
        .expect(403);
    });

    it("POST /users/:id/restore", async () => {
      await request(app.getHttpServer())
        .post(`/users/${stranger.userId}/restore`)
        .set(bearer(owner.token))
        .expect(403);
    });

    it("lets an admin through the same route", async () => {
      await request(app.getHttpServer()).get("/users").set(bearer(adminToken)).expect(200);
    });
  });

  describe("an abiding can only be changed by its author or an admin", () => {
    it("403 for a stranger patching it", async () => {
      await request(app.getHttpServer())
        .patch(`/abidings/${ownersAbidingId}`)
        .set(bearer(stranger.token))
        .send({ message: "hijacked" })
        .expect(403);
    });

    it("403 for a stranger deleting it", async () => {
      await request(app.getHttpServer())
        .delete(`/abidings/${ownersAbidingId}`)
        .set(bearer(stranger.token))
        .expect(403);
    });

    it("200 for the author", async () => {
      await request(app.getHttpServer())
        .patch(`/abidings/${ownersAbidingId}`)
        .set(bearer(owner.token))
        .send({ message: "edited by the author" })
        .expect(200);
    });

    it("200 for an admin on an abiding they did not write", async () => {
      await request(app.getHttpServer())
        .patch(`/abidings/${ownersAbidingId}`)
        .set(bearer(adminToken))
        .send({ message: "moderated" })
        .expect(200);
    });

    // 404 rather than 403, deliberately: answering 403 for an id that does not
    // exist would tell a caller which ids do.
    it("404, not 403, for an id that does not exist", async () => {
      await request(app.getHttpServer())
        .patch("/abidings/000000000000000000000000")
        .set(bearer(stranger.token))
        .send({ message: "nope" })
        .expect(404);
    });
  });

  describe("a profile can only be changed by its owner or an admin", () => {
    it("403 for a stranger", async () => {
      const profile = await request(app.getHttpServer())
        .get(`/profiles/user/${owner.userId}`)
        .expect(200);
      const { id } = profile.body as { id: number };

      await request(app.getHttpServer())
        .patch(`/profiles/${id}`)
        .set(bearer(stranger.token))
        .send({ bio: "hijacked" })
        .expect(403);
    });

    it("200 for the owner", async () => {
      const profile = await request(app.getHttpServer())
        .get(`/profiles/user/${owner.userId}`)
        .expect(200);
      const { id } = profile.body as { id: number };

      await request(app.getHttpServer())
        .patch(`/profiles/${id}`)
        .set(bearer(owner.token))
        .send({ bio: "mine" })
        .expect(200);
    });
  });

  // The author used to come from the request body, so anyone could post as
  // anyone. ValidationPipe runs with forbidNonWhitelisted, so the field is now
  // refused outright rather than ignored.
  describe("POST /abidings takes its author from the token", () => {
    it("400 when the body carries a userId", async () => {
      await request(app.getHttpServer())
        .post("/abidings")
        .set(bearer(owner.token))
        .send({ message: "posting as someone else", userId: String(stranger.userId) })
        .expect(400);
    });

    it("records the caller as the author", async () => {
      const posted = await request(app.getHttpServer())
        .post("/abidings")
        .set(bearer(stranger.token))
        .send({ message: "mine alone" })
        .expect(201);

      expect((posted.body as { userId: number }).userId).toBe(stranger.userId);
    });
  });

  it("rejects a forged token", async () => {
    await request(app.getHttpServer())
      .get("/users/me")
      .set({ authorization: "Bearer not.a.real.token" })
      .expect(401);
  });
});
