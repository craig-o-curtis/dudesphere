import { randomUUID } from "node:crypto";

import {
  AUTHENTICATION_MODULE_OPTIONS,
  type AuthenticationModuleOptions,
  JwtSigner,
} from "@nestjs/authentication";
import { INestApplication } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import * as bcrypt from "bcrypt";
import request from "supertest";
import type { App } from "supertest/types.js";
import { DataSource } from "typeorm";

import { configureApp } from "./../src/app-setup.js";
import { AppModule } from "./../src/app.module.js";
import authConfig from "./../src/auth/config/auth.config.js";
import { bearer, claimsOf, signedAMinuteEarlier } from "./auth-helpers.js";
import { listenOnLoopback } from "./listen-on-loopback.js";
import { signUpBody } from "./sign-up.js";

// Proves over real HTTP, with real scrypt and the real database, that a
// password is stored as a hash and checked against that hash. The unit specs
// fake the hasher, so only this file shows the whole path working.
//
// Needs the databases running. It deletes the users it creates.
describe("Passwords (e2e)", () => {
  let app: INestApplication<App>;
  let accessTokenOptions: NonNullable<AuthenticationModuleOptions["accessToken"]>;
  let dataSource: DataSource;
  const createdUserIds: number[] = [];

  async function register(password: string) {
    const sent = signUpBody({ password });

    const response = await request(app.getHttpServer()).post("/auth/sign-up").send(sent);
    const { id } = response.body as { id?: number };
    if (id !== undefined) {
      createdUserIds.push(id);
    }
    return { email: sent.email, userId: id, status: response.status };
  }

  function login(email: string, password: string) {
    return request(app.getHttpServer()).post("/auth/token").send({ identifier: email, password });
  }

  async function storedPassword(userId: number | undefined): Promise<string> {
    const rows: { password: string }[] = await dataSource.query(
      `SELECT "password" FROM "user" WHERE "id" = $1`,
      [userId],
    );
    return rows[0].password;
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
    accessTokenOptions = app.get<AuthenticationModuleOptions>(
      AUTHENTICATION_MODULE_OPTIONS,
    ).accessToken!;
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    // The refresh tokens first. They hold the user id as text, with no
    // foreign key, so nothing removes them with the user.
    await dataSource.query(`DELETE FROM refresh_tokens WHERE user_id = ANY($1::text[])`, [
      createdUserIds.map(String),
    ]);
    // The profile rows go with them: the foreign key is ON DELETE CASCADE.
    await dataSource.query(`DELETE FROM "user" WHERE "id" = ANY($1)`, [createdUserIds]);
    await app.close();
  });

  describe("sign-up", () => {
    // PasswordHasher's format: scrypt, with the cost it was made at.
    it("stores a scrypt hash, not the password", async () => {
      const { userId } = await register("secret123");

      const stored = await storedPassword(userId);

      expect(stored).not.toContain("secret123");
      expect(stored).toMatch(/^\$scrypt\$ln=17,r=8,p=1\$/);
    });

    it("gives two users with the same password different hashes", async () => {
      const first = await register("secret123");
      const second = await register("secret123");

      expect(await storedPassword(first.userId)).not.toBe(await storedPassword(second.userId));
    });

    it("never returns the password or its hash", async () => {
      const response = await request(app.getHttpServer())
        .post("/auth/sign-up")
        .send(signUpBody())
        .expect(201);
      createdUserIds.push((response.body as { id: number }).id);

      expect(response.body).not.toHaveProperty("password");
      expect(JSON.stringify(response.body)).not.toContain("$scrypt");
    });
  });

  describe("login", () => {
    it("accepts the right password and rejects a wrong one", async () => {
      const { email } = await register("secret123");

      const ok = await login(email, "secret123").expect(200);
      expect(ok.body).toHaveProperty("accessToken");

      await login(email, "secret124").expect(401);
    });

    // Sending the stored hash as the password must not work. If it did, a
    // leaked table would be as good as a list of passwords.
    it("rejects the stored hash used as a password", async () => {
      const { email, userId } = await register("secret123");

      await login(email, await storedPassword(userId)).expect(401);
    });

    it("gives the same answer for an unknown email as for a wrong password", async () => {
      const { email } = await register("secret123");

      const wrongPassword = await login(email, "secret124").expect(401);
      const unknownEmail = await login("e2e-nobody@example.com", "secret123").expect(401);

      expect(unknownEmail.body).toEqual(wrongPassword.body);
    });

    // Hashes stored before PasswordHasher are bcrypt. They still sign in, and
    // the first sign-in replaces the hash with a scrypt one, since only then
    // is the password at hand.
    it("signs in with an old bcrypt hash, and replaces it with scrypt", async () => {
      const { email, userId } = await register("secret123");
      const oldHash = await bcrypt.hash("secret123", 4);
      await dataSource.query(`UPDATE "user" SET "password" = $1 WHERE "id" = $2`, [
        oldHash,
        userId,
      ]);

      await login(email, "secret124").expect(401);
      expect(await storedPassword(userId)).toBe(oldHash);

      await login(email, "secret123").expect(200);
      expect(await storedPassword(userId)).toMatch(/^\$scrypt\$/);
      await login(email, "secret123").expect(200);
    });
  });

  describe("sign-up password length", () => {
    it("accepts 128 characters, and that password then signs in", async () => {
      const password = "a".repeat(128);
      const { email, status } = await register(password);

      expect(status).toBe(201);
      await login(email, password).expect(200);
    });

    it("rejects 129 characters with a 400", async () => {
      const { status } = await register("a".repeat(129));

      expect(status).toBe(400);
    });

    // bcrypt read only the first 72 bytes, so two long passwords that shared
    // them both signed in. scrypt reads every character.
    it("tells apart two long passwords that share their first 72 bytes", async () => {
      const password = `${"a".repeat(72)}-one`;
      const { email } = await register(password);

      await login(email, `${"a".repeat(72)}-two`).expect(401);
      await login(email, password).expect(200);
    });
  });

  describe("changing your own password", () => {
    async function signUp() {
      const { email } = await register("secret123");
      const { body } = await login(email, "secret123").expect(200);
      return { email, token: (body as { accessToken: string }).accessToken };
    }

    function changePassword(token: string, body: object) {
      return request(app.getHttpServer()).patch("/users/me").set(bearer(token)).send(body);
    }

    it("is refused with a 400 when the current password is not sent", async () => {
      const { email, token } = await signUp();

      await changePassword(token, { password: "secret456" }).expect(400);

      await login(email, "secret123").expect(200);
    });

    it("is refused with a 403 when the current password is wrong", async () => {
      const { email, token } = await signUp();

      await changePassword(token, { password: "secret456", currentPassword: "secret999" }).expect(
        403,
      );

      await login(email, "secret123").expect(200);
      await login(email, "secret456").expect(401);
    });

    it("works with the right current password, and the old one stops working", async () => {
      const { email, token } = await signUp();

      const response = await changePassword(token, {
        password: "secret456",
        currentPassword: "secret123",
      }).expect(200);

      expect(response.body).not.toHaveProperty("password");
      expect(response.body).not.toHaveProperty("currentPassword");
      await login(email, "secret456").expect(200);
      await login(email, "secret123").expect(401);
    });

    // Whoever holds a token from before the change logged in with the old
    // password. That may be the member's other phone, or it may be the thief
    // the member is changing the password to get rid of.
    it("ends the tokens that were signed before the change", async () => {
      const { email, token } = await signUp();
      const earlier = signedAMinuteEarlier(app, token);
      await request(app.getHttpServer()).get("/users/me").set(bearer(earlier)).expect(200);

      await changePassword(token, { password: "secret456", currentPassword: "secret123" }).expect(
        200,
      );

      const refused = await request(app.getHttpServer())
        .get("/users/me")
        .set(bearer(earlier))
        .expect(401);
      // JwtAuth.validate refuses it, which the package reports this way.
      expect(refused.body).toMatchObject({ statusCode: 401, message: "unknown subject" });

      // The member logs in again with the new password, and that token works.
      const { body } = await login(email, "secret456").expect(200);
      await request(app.getHttpServer())
        .get("/users/me")
        .set(bearer((body as { accessToken: string }).accessToken))
        .expect(200);
    });

    // Only a password change signs anybody out.
    it("keeps the tokens when only the username changes", async () => {
      const { token } = await signUp();
      const earlier = signedAMinuteEarlier(app, token);

      await changePassword(token, { username: `e2e-${randomUUID().slice(0, 8)}` }).expect(200);

      await request(app.getHttpServer()).get("/users/me").set(bearer(earlier)).expect(200);
    });

    it("does not ask for the current password when only the username changes", async () => {
      const { token } = await signUp();
      const username = `e2e-${randomUUID().slice(0, 8)}`;

      const response = await changePassword(token, { username }).expect(200);

      expect(response.body).toMatchObject({ username });
    });
  });

  describe("the access token", () => {
    it("carries an audience, an issuer and an expiry", async () => {
      const { email } = await register("secret123");
      const { body } = await login(email, "secret123").expect(200);

      const claims: Record<string, unknown> = claimsOf(
        (body as { accessToken: string }).accessToken,
      );

      expect(claims.aud).toBe("dudesphere-api");
      expect(claims.iss).toBe("dudesphere");
      // JWT_EXPIRES_IN: 900 seconds unless .env sets another value.
      const { expiresIn } = app.get<ConfigType<typeof authConfig>>(authConfig.KEY);
      expect(Number(claims.exp) - Number(claims.iat)).toBe(expiresIn);
    });

    // Signed with this app's own secret, so only the audience is wrong.
    it("is rejected when it was issued for another audience", async () => {
      const { email, userId } = await register("secret123");
      const { body } = await login(email, "secret123").expect(200);
      const forged = new JwtSigner({ ...accessTokenOptions, audience: "some-other-app" }).sign({
        sub: String(userId),
      });

      await request(app.getHttpServer())
        .get("/users/me")
        .set(bearer((body as { accessToken: string }).accessToken))
        .expect(200);
      await request(app.getHttpServer()).get("/users/me").set(bearer(forged)).expect(401);
    });
  });
});
