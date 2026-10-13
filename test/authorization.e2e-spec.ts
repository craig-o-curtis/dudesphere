import { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types.js";

import { configureApp } from "./../src/app-setup.js";
import { AppModule } from "./../src/app.module.js";
import { UserRole } from "./../src/users/user.entity.js";
import { bearer, setRole, signedInAs, tokenFor } from "./auth-helpers.js";
import { listenOnLoopback } from "./listen-on-loopback.js";
import { signUp, signUpBody } from "./sign-up.js";

// The only place the guards are proved over real HTTP. A unit controller spec
// cannot do it: both guards are APP_GUARDs registered in AppModule, and
// Test.createTestingModule({ controllers: [...] }) never registers those, so a
// 401 or 403 is unreachable there.
//
// Needs the databases running. Creates throwaway e2e- users and their
// abidings, one of them an admin. test/global-setup.ts deletes them when the
// run ends.
describe("Authorization (e2e)", () => {
  let app: INestApplication<App>;
  let jwt: JwtService;

  // A plain user, and a second one to be the stranger in the ownership cases.
  let owner: { token: string; userId: number };
  let stranger: { token: string; userId: number };
  let adminToken: string;
  let ownersAbidingId: string;

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

    owner = await signedInAs(app, UserRole.USER);
    stranger = await signedInAs(app, UserRole.USER);

    // A real admin, and a third person: neither the owner nor the stranger.
    // A token that only claimed the role would be refused, because the guard
    // reads the role from the database.
    adminToken = await tokenFor(app, UserRole.ADMIN);

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
    ] as const)("GET %s is %i", async (path, status) => {
      await request(app.getHttpServer()).get(path).expect(status);
    });

    // On a public route the token is optional. A good one identifies the
    // caller; a bad one is ignored and must never turn the route into a 401.
    it.each([
      ["a token this app did not sign", "Bearer not.a.token"],
      ["a header that is not a bearer token", "Basic abc123"],
    ])("GET /abidings is still 200 with %s", async (_what, authorization) => {
      await request(app.getHttpServer()).get("/abidings").set({ authorization }).expect(200);
    });

    it("GET /abidings is 200 with a good token too", async () => {
      await request(app.getHttpServer()).get("/abidings").set(bearer(owner.token)).expect(200);
    });

    // Both have to stay open or there is no way to get a first token.
    it("POST /auth/login and POST /auth/signup are reachable anonymously", async () => {
      await request(app.getHttpServer())
        .post("/auth/login")
        .send({ identifier: "nobody@example.com", password: "wrong" })
        .expect(401); // reached the handler, which rejected the credentials

      await signUp(app);
    });
  });

  describe("401 without a token", () => {
    it.each([
      ["get", "/users/me"],
      ["get", "/users/1"],
      ["get", "/abidings/me"],
      ["get", "/profiles"],
      ["get", "/profiles/me"],
      ["get", "/profiles/1"],
      ["get", "/profiles/user/1"],
      ["post", "/abidings"],
      ["get", "/users"],
      ["post", "/users"],
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

    // Creating a user directly is for admins. Everyone else signs up through
    // POST /auth/signup.
    it("POST /users", async () => {
      await request(app.getHttpServer())
        .post("/users")
        .set(bearer(owner.token))
        .send(signUpBody())
        .expect(403);
    });

    it("lets an admin through the same route", async () => {
      await request(app.getHttpServer()).get("/users").set(bearer(adminToken)).expect(200);
    });

    it("lets an admin create a user with POST /users", async () => {
      const sent = signUpBody();
      const { body } = await request(app.getHttpServer())
        .post("/users")
        .set(bearer(adminToken))
        .send(sent)
        .expect(201);

      expect(body).toMatchObject({ username: sent.username, role: UserRole.USER });
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

  // The record carries the email and the role. Before this rule any signed-in
  // caller could read anyone's.
  describe("a user record can only be read by that user or an admin", () => {
    it("200 for the user themselves, with their own email", async () => {
      const { body } = await request(app.getHttpServer())
        .get(`/users/${owner.userId}`)
        .set(bearer(owner.token))
        .expect(200);

      expect(body).toMatchObject({ id: owner.userId, role: UserRole.USER });
      expect((body as { email: string }).email).toMatch(/^e2e-/);
    });

    it("403 for another member, with nothing of the user in the body", async () => {
      const { body } = await request(app.getHttpServer())
        .get(`/users/${owner.userId}`)
        .set(bearer(stranger.token))
        .expect(403);

      expect(body).toEqual({
        statusCode: 403,
        message: "Not authorized to read this user",
        error: "Forbidden",
        errorCode: "NOT_OWNER",
      });
    });

    it("200 for an admin reading someone else", async () => {
      const { body } = await request(app.getHttpServer())
        .get(`/users/${stranger.userId}`)
        .set(bearer(adminToken))
        .expect(200);

      expect(body).toMatchObject({ id: stranger.userId });
    });

    // 404 before 403, as for abidings and profiles.
    it("404 for a user that does not exist, even for a member", async () => {
      await request(app.getHttpServer())
        .get("/users/2147483647")
        .set(bearer(stranger.token))
        .expect(404);
    });
  });

  describe("a profile can only be changed by its owner or an admin", () => {
    it("403 for a stranger", async () => {
      // Reading someone else's profile is allowed for any signed-in caller.
      const profile = await request(app.getHttpServer())
        .get(`/profiles/user/${owner.userId}`)
        .set(bearer(stranger.token))
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
        .set(bearer(owner.token))
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

    // Signed by this app, so the signature is good, but no user has this id.
    // The guard looks the user up and finds nobody.
    it("401 when the token's user does not exist", async () => {
      const token = await jwt.signAsync({ sub: 2_000_000_000, username: "e2e-nobody" });

      const response = await request(app.getHttpServer())
        .post("/abidings")
        .set(bearer(token))
        .send({ message: "posted by nobody" })
        .expect(401);

      expect(response.body).toMatchObject({ errorCode: "TOKEN_INVALID" });
    });
  });

  // A token's payload is only base64. Anyone can read it and write a new one.
  // What they cannot do is sign it, and these are the ways someone might try
  // to get around that.
  describe("a token someone has tampered with", () => {
    /** The three parts of a token: header, payload, signature. */
    function partsOf(token: string): [string, string, string] {
      const [header, payload, signature] = token.split(".");
      return [header, payload, signature];
    }

    function encode(value: object): string {
      return Buffer.from(JSON.stringify(value)).toString("base64url");
    }

    function decode(part: string): Record<string, unknown> {
      return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
    }

    async function expectRefused(token: string) {
      const response = await request(app.getHttpServer())
        .get("/users")
        .set(bearer(token))
        .expect(401);

      expect(response.body).toMatchObject({ errorCode: "TOKEN_INVALID" });
    }

    it("401 for text that is not a token at all", async () => {
      await expectRefused("not.a.real.token");
    });

    // The attack itself: a member takes their own token, writes "admin" into
    // it and keeps the old signature. The signature no longer matches.
    it("401 for a real token with a role written into its payload", async () => {
      const [header, payload, signature] = partsOf(owner.token);
      const edited = encode({ ...decode(payload), role: UserRole.ADMIN });

      await expectRefused([header, edited, signature].join("."));
    });

    // The same, aimed at the id: a member writes the admin's id over theirs.
    it("401 for a real token with another user's id written into it", async () => {
      const [header, payload, signature] = partsOf(owner.token);
      const edited = encode({ ...decode(payload), sub: stranger.userId });

      await expectRefused([header, edited, signature].join("."));
    });

    // "none" is a real JWT algorithm: no signature at all. A library that
    // honoured the header would accept anything.
    it("401 for an unsigned token that names the algorithm 'none'", async () => {
      const [, payload] = partsOf(owner.token);
      const unsigned = [encode({ alg: "none", typ: "JWT" }), payload, ""].join(".");

      await expectRefused(unsigned);
    });

    // Signed with the app's real key, so only the pinned algorithm in
    // AuthModule refuses it.
    it("401 for a token signed with an algorithm other than HS256", async () => {
      const token = await jwt.signAsync(
        { sub: owner.userId, username: "e2e" },
        { algorithm: "HS512" },
      );

      await expectRefused(token);
    });
  });

  // The role comes from the database on every request. Nothing in a token
  // can grant one, and a token does not keep one its member has lost.
  describe("the database decides the role, not the token", () => {
    // Signed by the app itself, as a leaked key or an old token would be.
    // The claim is simply not read.
    it("403 on an admin route for a signed token that claims admin for a plain user", async () => {
      const token = await jwt.signAsync({
        sub: owner.userId,
        username: "e2e",
        role: UserRole.ADMIN,
      });

      const response = await request(app.getHttpServer())
        .get("/users")
        .set(bearer(token))
        .expect(403);

      expect(response.body).toMatchObject({ errorCode: "ROLE_REQUIRED" });
    });

    it("a demoted admin loses admin on the next request, with the same token", async () => {
      const admin = await signedInAs(app, UserRole.ADMIN);
      await request(app.getHttpServer()).get("/users").set(bearer(admin.token)).expect(200);

      await setRole(app, admin.userId, UserRole.USER);

      await request(app.getHttpServer()).get("/users").set(bearer(admin.token)).expect(403);
    });

    it("a member made admin gains it on the next request, with the same token", async () => {
      const member = await signedInAs(app, UserRole.USER);
      await request(app.getHttpServer()).get("/users").set(bearer(member.token)).expect(403);

      await setRole(app, member.userId, UserRole.ADMIN);

      await request(app.getHttpServer()).get("/users").set(bearer(member.token)).expect(200);
    });
  });
});
