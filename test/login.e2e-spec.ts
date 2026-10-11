import { randomUUID } from "node:crypto";

import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types.js";

import { configureApp } from "./../src/app-setup.js";
import { AppModule } from "./../src/app.module.js";
import { listenOnLoopback } from "./listen-on-loopback.js";
import { signUpBody } from "./sign-up.js";

// Login takes a username or an email in one field, `identifier`, and ignores
// letter case in both. The case part is Postgres's doing: the two columns are
// citext. A unit test with a mocked repository cannot show that, so it is
// proved here against the real database.
//
// Needs the databases running and the migrations applied. Creates throwaway
// e2e- users. test/global-setup.ts deletes them when the run ends.
describe("Login (e2e)", () => {
  let app: INestApplication<App>;

  // 8 hex characters, so the upper-case form below differs from this one
  // whenever the tag holds a letter. "e2e-" itself always differs from "E2E-".
  const tag = randomUUID().slice(0, 8);
  const username = `e2e-${tag}`;
  const email = `e2e-${tag}@example.com`;
  const password = "secret123";
  let userId: number;

  function login(identifier: unknown, withPassword: string = password) {
    return request(app.getHttpServer())
      .post("/auth/token")
      .send({ identifier, password: withPassword });
  }

  function signup(body: { username: string; email: string }) {
    return request(app.getHttpServer())
      .post("/auth/signup")
      .send(signUpBody({ ...body, password }));
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Same global pipes, filters and interceptor as main.ts, so this tests the
    // app that actually runs. See src/app-setup.ts.
    configureApp(app);
    await listenOnLoopback(app);

    const created = await signup({ username, email }).expect(201);
    userId = (created.body as { id: number }).id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe("a username or an email both log the same user in", () => {
    it.each([
      ["the email", () => email],
      ["the username", () => username],
      ["the email in capitals", () => email.toUpperCase()],
      ["the username in capitals", () => username.toUpperCase()],
      ["the email with a space after it", () => `${email} `],
      ["the username with spaces around it", () => `  ${username}  `],
    ])("with %s", async (_what, identifier) => {
      const { body } = await login(identifier()).expect(200);

      // The answer says nothing about the member. A client asks GET /users/me.
      expect(body).toEqual({ accessToken: expect.any(String), expiresIn: 3600 });

      // And the token is that member's, whatever casing the caller typed.
      const me = await request(app.getHttpServer())
        .get("/users/me")
        .set({ authorization: `Bearer ${(body as { accessToken: string }).accessToken}` })
        .expect(200);
      expect(me.body).toMatchObject({ id: userId, username });
    });
  });

  describe("every failed login gets the same answer", () => {
    const refused = {
      statusCode: 401,
      message: "Invalid username, email or password",
      error: "Unauthorized",
      errorCode: "BAD_CREDENTIALS",
    };

    // Nothing in the body says which of the two was wrong, so a caller
    // cannot use login to find out which usernames and emails have an account.
    it.each([
      ["the right email and a wrong password", () => email, "not-the-password"],
      ["the right username and a wrong password", () => username, "not-the-password"],
      ["an email nobody has", () => `e2e-nobody-${tag}@example.com`, password],
      ["a username nobody has", () => `e2e-nobody-${tag}`, password],
      // Longer than a username can be, and not an email: still just a 401.
      ["a value that could be neither", () => "x".repeat(60), password],
    ])("401 for %s", async (_what, identifier, withPassword) => {
      const { body } = await login(identifier(), withPassword).expect(401);

      expect(body).toEqual(refused);
    });

    // The email must not be tried as a username, nor the other way round:
    // the part of the email before the @ is not this user's username.
    it("401 for the part of the email before the @", async () => {
      const localPartOfAnother = `e2e-local-${tag}`;
      await signup({
        username: `e2e-other-${tag}`,
        email: `${localPartOfAnother}@example.com`,
      }).expect(201);

      await login(localPartOfAnother).expect(401);
    });
  });

  describe("400 for a body that is not a login", () => {
    it("the old shape, with email in place of identifier", async () => {
      const { body } = await request(app.getHttpServer())
        .post("/auth/token")
        .send({ email, password })
        .expect(400);

      expect((body as { message: string[] }).message).toEqual(
        expect.arrayContaining(["property email should not exist"]),
      );
    });

    it.each([
      ["no identifier", { password }],
      ["an empty identifier", { identifier: "   ", password }],
      ["an identifier longer than an email can be", { identifier: "a".repeat(101), password }],
      ["no password", { identifier: email }],
      ["a password longer than 72 bytes", { identifier: email, password: "a".repeat(73) }],
    ])("%s", async (_what, body) => {
      await request(app.getHttpServer()).post("/auth/token").send(body).expect(400);
    });
  });

  // Login tells a username from an email by the @. These are the rules that
  // keep that safe, checked at the door where a username is chosen.
  describe("sign up keeps usernames and emails apart", () => {
    it("400 for a username that is someone's email address", async () => {
      const { body } = await signup({ username: email, email: `e2e-x-${tag}@example.com` }).expect(
        400,
      );

      expect((body as { message: string[] }).message).toContain(
        "username must not contain spaces or @",
      );
    });

    it("400 for a username with a space in it", async () => {
      await signup({ username: `e2e ${tag}`, email: `e2e-y-${tag}@example.com` }).expect(400);
    });

    it("409 USERNAME_TAKEN for a username that differs only by case", async () => {
      const { body } = await signup({
        username: username.toUpperCase(),
        email: `e2e-z-${tag}@example.com`,
      }).expect(409);

      expect(body).toMatchObject({ errorCode: "USERNAME_TAKEN" });
    });

    it("409 EMAIL_TAKEN for an email that differs only by case", async () => {
      const { body } = await signup({
        username: `e2e-w-${tag}`,
        email: email.toUpperCase(),
      }).expect(409);

      expect(body).toMatchObject({ errorCode: "EMAIL_TAKEN" });
    });

    // The same rule on the way to changing a username later.
    it("400 when a user tries to change their username to one with an @", async () => {
      const { body: session } = await login(email).expect(200);

      await request(app.getHttpServer())
        .patch("/users/me")
        .set({ authorization: `Bearer ${(session as { accessToken: string }).accessToken}` })
        .send({ username: `e2e-${tag}@x.com` })
        .expect(400);
    });
  });
});
