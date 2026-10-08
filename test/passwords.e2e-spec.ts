import { randomUUID } from "node:crypto";

import { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types.js";
import { DataSource } from "typeorm";

import { configureApp } from "./../src/app-setup.js";
import { AppModule } from "./../src/app.module.js";
import { listenOnLoopback } from "./listen-on-loopback.js";

// Proves over real HTTP, with real bcrypt and the real database, that a
// password is stored as a hash and checked against that hash. The unit specs
// fake the hasher, so only this file shows the whole path working.
//
// Needs the databases running. It deletes the users it creates.
describe("Passwords (e2e)", () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  let dataSource: DataSource;
  const createdUserIds: number[] = [];

  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

  const register = async (password: string) => {
    // randomUUID, not Date.now(), which the gmt lint rules ban. 8 characters
    // keep the username under its 24-character limit.
    const tag = randomUUID().slice(0, 8);
    const email = `e2e-${tag}@example.com`;

    const response = await request(app.getHttpServer())
      .post("/users")
      .send({ email, password, username: `e2e-${tag}` });
    const { id } = response.body as { id?: number };
    if (id !== undefined) {
      createdUserIds.push(id);
    }
    return { email, userId: id, status: response.status };
  };

  const login = (email: string, password: string) =>
    request(app.getHttpServer()).post("/auth").send({ email, password });

  const storedPassword = async (userId: number | undefined): Promise<string> => {
    const rows: { password: string }[] = await dataSource.query(
      `SELECT "password" FROM "user" WHERE "id" = $1`,
      [userId],
    );
    return rows[0].password;
  };

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
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    // The profile rows go with them: the foreign key is ON DELETE CASCADE.
    await dataSource.query(`DELETE FROM "user" WHERE "id" = ANY($1)`, [createdUserIds]);
    await app.close();
  });

  describe("sign-up", () => {
    it("stores a bcrypt hash, not the password", async () => {
      const { userId } = await register("secret123");

      const stored = await storedPassword(userId);

      expect(stored).not.toContain("secret123");
      expect(stored).toMatch(/^\$2[aby]\$12\$.{53}$/);
    });

    it("gives two users with the same password different hashes", async () => {
      const first = await register("secret123");
      const second = await register("secret123");

      expect(await storedPassword(first.userId)).not.toBe(await storedPassword(second.userId));
    });

    it("never returns the password or its hash", async () => {
      const tag = randomUUID().slice(0, 8);
      const response = await request(app.getHttpServer())
        .post("/users")
        .send({ email: `e2e-${tag}@example.com`, password: "secret123", username: `e2e-${tag}` })
        .expect(201);
      createdUserIds.push((response.body as { id: number }).id);

      expect(response.body).not.toHaveProperty("password");
      expect(JSON.stringify(response.body)).not.toContain("$2");
    });
  });

  describe("login", () => {
    it("accepts the right password and rejects a wrong one", async () => {
      const { email } = await register("secret123");

      const ok = await login(email, "secret123").expect(201);
      expect(ok.body).toHaveProperty("token");

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
  });

  describe("sign-up password length", () => {
    it("accepts 72 bytes, and that password then logs in", async () => {
      const password = "a".repeat(72);
      const { email, status } = await register(password);

      expect(status).toBe(201);
      await login(email, password).expect(201);
    });

    it("rejects 73 bytes with a 400", async () => {
      const { status } = await register("a".repeat(73));

      expect(status).toBe(400);
    });

    // 37 characters, but "é" is 2 bytes, so 74 bytes.
    it("counts bytes, not characters", async () => {
      const { status } = await register("é".repeat(37));

      expect(status).toBe(400);
    });
  });

  describe("changing your own password", () => {
    const signUp = async () => {
      const { email } = await register("secret123");
      const { body } = await login(email, "secret123").expect(201);
      return { email, token: (body as { token: string }).token };
    };

    const changePassword = (token: string, body: object) =>
      request(app.getHttpServer()).patch("/users/me").set(bearer(token)).send(body);

    it("is refused with a 400 when the current password is not sent", async () => {
      const { email, token } = await signUp();

      await changePassword(token, { password: "secret456" }).expect(400);

      await login(email, "secret123").expect(201);
    });

    it("is refused with a 403 when the current password is wrong", async () => {
      const { email, token } = await signUp();

      await changePassword(token, { password: "secret456", currentPassword: "secret999" }).expect(
        403,
      );

      await login(email, "secret123").expect(201);
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
      await login(email, "secret456").expect(201);
      await login(email, "secret123").expect(401);
    });

    it("does not ask for the current password when only the username changes", async () => {
      const { token } = await signUp();
      const username = `e2e-${randomUUID().slice(0, 8)}`;

      const response = await changePassword(token, { username }).expect(200);

      expect(response.body).toMatchObject({ username });
    });
  });

  describe("the login token", () => {
    it("carries an audience, an issuer and an expiry", async () => {
      const { email } = await register("secret123");
      const { body } = await login(email, "secret123").expect(201);

      const claims: Record<string, unknown> = jwt.decode((body as { token: string }).token);

      expect(claims.aud).toBe("dudesphere-api");
      expect(claims.iss).toBe("dudesphere");
      expect(Number(claims.exp) - Number(claims.iat)).toBe(3600);
    });

    // Signed with this app's own secret, so only the audience is wrong.
    it("is rejected when it was issued for another audience", async () => {
      const { email, userId } = await register("secret123");
      const { body } = await login(email, "secret123").expect(201);
      const forged = await jwt.signAsync(
        { sub: userId, username: "e2e-forged", role: "user" },
        { audience: "some-other-app" },
      );

      await request(app.getHttpServer())
        .get("/users/me")
        .set(bearer((body as { token: string }).token))
        .expect(200);
      await request(app.getHttpServer()).get("/users/me").set(bearer(forged)).expect(401);
    });
  });
});
