import { createHash, randomUUID } from "node:crypto";

import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types.js";
import { DataSource } from "typeorm";

import { configureApp } from "./../src/app-setup.js";
import { AppModule } from "./../src/app.module.js";
import { MailProvider, type MailMessage } from "./../src/mail/mail.provider.js";
import { bearer, signedAMinuteEarlier } from "./auth-helpers.js";
import { listenOnLoopback } from "./listen-on-loopback.js";
import { signUp as signUpUser } from "./sign-up.js";

// The whole forgot-password flow over real HTTP and the real database: ask
// for a link, read the email, use the token, log in with the new password.
//
// No mail server is needed. MailProvider is swapped for a fake that keeps
// each message, and the test reads the token out of the link, as a person
// would from their inbox.
//
// The links themselves are @nestjs/authentication's: PasswordResetService
// makes, stores and checks them, in the email_tokens table. The app's half is
// PasswordResetMailer. See https://docs.nestjs.com/security/authentication.
//
// Needs the databases running and the migrations applied. Creates throwaway
// e2e- users. test/global-setup.ts deletes them, and their links, when the
// run ends.
describe("Password reset (e2e)", () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  const sent: MailMessage[] = [];
  const fakeMail: MailProvider = {
    send(message) {
      sent.push(message);
      return Promise.resolve();
    },
  };

  const oldPassword = "a-long-secret-123";
  const newPassword = "a-brand-new-secret";

  const refused = {
    statusCode: 400,
    message: "Invalid or expired link",
    error: "Bad Request",
    errorCode: "RESET_TOKEN_INVALID",
  };

  // A fresh user for each test, so no test reads another's email.
  async function signUp(): Promise<{ id: number; username: string; email: string }> {
    const { sent, user } = await signUpUser(app, { password: oldPassword });
    return { username: sent.username, email: sent.email, id: user.id };
  }

  function forgot(email: string) {
    return request(app.getHttpServer()).post("/auth/password/forgot").send({ email });
  }

  function reset(token: string, password = newPassword) {
    return request(app.getHttpServer()).post("/auth/password/reset").send({ token, password });
  }

  /** The member's stored reset links. */
  function linksOf(userId: number): Promise<{ id: string }[]> {
    return dataSource.query(
      `SELECT id FROM email_tokens WHERE user_id = $1 AND purpose = 'password-reset'`,
      [String(userId)],
    );
  }

  function login(identifier: string, password: string) {
    return request(app.getHttpServer()).post("/auth/token").send({ identifier, password });
  }

  function emailsTo(address: string): MailMessage[] {
    return sent.filter((message) => message.to === address);
  }

  function tokenIn(message: MailMessage): string {
    const link = /https?:\/\/\S+/.exec(message.text)?.[0] ?? "";
    return new URL(link).searchParams.get("token") ?? "";
  }

  // Asks for a link and returns the token from the email. The route answers
  // before the email is sent, so this waits for it to arrive. `as` is the
  // spelling to ask with; the email always goes to the stored address.
  async function requestToken(email: string, as = email): Promise<string> {
    const before = emailsTo(email).length;
    await forgot(as).expect(202);
    await vi.waitFor(() => {
      expect(emailsTo(email)).toHaveLength(before + 1);
    });
    return tokenIn(emailsTo(email)[before]);
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailProvider)
      .useValue(fakeMail)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await listenOnLoopback(app);
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  describe("asking for a link", () => {
    // Nothing in the answer says whether the address has an account.
    it("answers 202 with no body for a known email and an unknown one alike", async () => {
      const user = await signUp();

      const known = await forgot(user.email).expect(202);
      const unknown = await forgot(`e2e-nobody-${randomUUID().slice(0, 8)}@example.com`).expect(
        202,
      );

      expect(known.text).toBe("");
      expect(unknown.text).toBe(known.text);
    });

    it("emails a link to the web app's reset page", async () => {
      const user = await signUp();

      const token = await requestToken(user.email);

      const [message] = emailsTo(user.email);
      expect(message.subject).toBe("Reset your Dudesphere password");
      expect(message.text).toContain(`Hi ${user.username},`);
      expect(message.text).toMatch(/https?:\/\/\S+\/reset-password\?token=/);
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it("stores a hash of the token, and not the token", async () => {
      const user = await signUp();

      const token = await requestToken(user.email);

      const rows = await linksOf(user.id);
      expect(rows).toHaveLength(1);
      // The package's own format: SHA-256, in base64url.
      expect(rows[0].id).toBe(createHash("sha256").update(token).digest("base64url"));
      expect(rows[0].id).not.toContain(token);
    });

    // The email column ignores case, so the lookup does too. The email goes
    // to the address as it is stored.
    it("finds the account when the email is typed in capitals", async () => {
      const user = await signUp();

      const token = await requestToken(user.email, user.email.toUpperCase());

      await reset(token).expect(204);
    });

    it("sends nothing to a user who closed their account", async () => {
      const closed = await signUp();
      const { body: session } = await login(closed.email, oldPassword).expect(200);
      await request(app.getHttpServer())
        .delete("/users/me")
        .set({ authorization: `Bearer ${(session as { accessToken: string }).accessToken}` })
        .expect(204);

      await forgot(closed.email).expect(202);
      // A second request, for a live user, sent after it. Once that email is
      // here, the first request has had its turn, and sent nothing.
      const live = await signUp();
      await requestToken(live.email);

      expect(emailsTo(closed.email)).toEqual([]);
    });

    it("400 for a body that is not an email", async () => {
      await forgot("not-an-email").expect(400);
    });
  });

  describe("using the link", () => {
    it("sets the new password: the old one stops working and the new one logs in", async () => {
      const user = await signUp();
      const token = await requestToken(user.email);

      const response = await reset(token).expect(204);

      expect(response.text).toBe("");
      await login(user.email, oldPassword).expect(401);
      await login(user.email, newPassword).expect(200);
      // By username too: it is the same account.
      await login(user.username, newPassword).expect(200);
    });

    // A member resets a password because they forgot it, or because someone
    // else has it. Either way, whoever was signed in before is signed out.
    it("ends the access tokens that were signed before the reset", async () => {
      const user = await signUp();
      const { body: session } = await login(user.email, oldPassword).expect(200);
      const earlier = signedAMinuteEarlier(app, (session as { accessToken: string }).accessToken);
      await request(app.getHttpServer()).get("/users/me").set(bearer(earlier)).expect(200);

      await reset(await requestToken(user.email)).expect(204);

      // Refused through passwordChangedAt, which PasswordResetMailer stamps.
      const refused = await request(app.getHttpServer())
        .get("/users/me")
        .set(bearer(earlier))
        .expect(401);
      expect(refused.body).toMatchObject({ statusCode: 401, message: "unknown subject" });

      const { body: fresh } = await login(user.email, newPassword).expect(200);
      await request(app.getHttpServer())
        .get("/users/me")
        .set(bearer((fresh as { accessToken: string }).accessToken))
        .expect(200);
    });

    // The package ends every sign-in of the member after a reset, so a
    // refresh token from before it cannot be swapped for a new pair. The
    // access token that came with it is the test above: one signed in the
    // same second as the reset still passes, on purpose.
    it("ends the refresh tokens from before the reset", async () => {
      const user = await signUp();
      const { body: session } = await login(user.email, oldPassword).expect(200);
      const { refreshToken } = session as { refreshToken: string };

      await reset(await requestToken(user.email)).expect(204);

      const refused = await request(app.getHttpServer())
        .post("/auth/token/refresh")
        .send({ refreshToken })
        .expect(401);
      expect(refused.body).toMatchObject({ statusCode: 401, message: "Refresh token invalid" });
    });

    it("stores the new password as a scrypt hash, as sign-up does", async () => {
      const user = await signUp();
      const token = await requestToken(user.email);
      await reset(token).expect(204);

      const rows: { password: string }[] = await dataSource.query(
        `SELECT "password" FROM "user" WHERE "id" = $1`,
        [user.id],
      );
      expect(rows[0].password).toMatch(/^\$scrypt\$/);
      expect(rows[0].password).not.toContain(newPassword);
    });

    it("works once: the same link again is a 400", async () => {
      const user = await signUp();
      const token = await requestToken(user.email);
      await reset(token).expect(204);

      const { body } = await reset(token, "another-secret-1").expect(400);

      expect(body).toEqual(refused);
      // The second try changed nothing.
      await login(user.email, newPassword).expect(200);
    });

    it("leaves no token behind once it is used", async () => {
      const user = await signUp();
      const token = await requestToken(user.email);
      await reset(token).expect(204);

      expect(await linksOf(user.id)).toEqual([]);
    });

    it("400 for a token that was never issued", async () => {
      const { body } = await reset(randomUUID()).expect(400);

      expect(body).toEqual(refused);
    });

    it("400 for an expired link, and the password stays as it was", async () => {
      const user = await signUp();
      const token = await requestToken(user.email);
      // Moved into the past with raw SQL. No route can do it, and waiting
      // out the real 30 minutes is not an option.
      await dataSource.query(
        `UPDATE email_tokens SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE user_id = $1`,
        [String(user.id)],
      );

      const { body } = await reset(token).expect(400);

      expect(body).toEqual(refused);
      await login(user.email, oldPassword).expect(200);
    });

    // As the docs describe it: asking again sends a new link and leaves the
    // earlier one working, in case the newer email is the one that is late.
    // Using either link kills the other.
    it("asking again leaves both links working until one of them is used", async () => {
      const user = await signUp();
      const first = await requestToken(user.email);
      const second = await requestToken(user.email);

      expect(second).not.toBe(first);
      expect(await linksOf(user.id)).toHaveLength(2);
      await reset(first).expect(204);
      expect((await reset(second).expect(400)).body).toEqual(refused);
    });

    it("400 for a user who closed their account after the email was sent", async () => {
      const user = await signUp();
      const token = await requestToken(user.email);
      const { body: session } = await login(user.email, oldPassword).expect(200);
      await request(app.getHttpServer())
        .delete("/users/me")
        .set({ authorization: `Bearer ${(session as { accessToken: string }).accessToken}` })
        .expect(204);

      const { body } = await reset(token).expect(400);

      expect(body).toEqual(refused);
    });
  });

  describe("400 for a body that is not a reset", () => {
    // The docs' reset takes the token and the password, nothing else.
    // Typing the password twice is the web page's job. A client that still
    // sends confirmPassword is refused before the token is looked at, so the
    // link still works after.
    it("confirmPassword, which the route no longer takes, and the link survives it", async () => {
      const user = await signUp();
      const token = await requestToken(user.email);

      const { body } = await request(app.getHttpServer())
        .post("/auth/password/reset")
        .send({ token, password: newPassword, confirmPassword: newPassword })
        .expect(400);

      expect((body as { message: string[] }).message).toContain(
        "property confirmPassword should not exist",
      );
      await reset(token).expect(204);
    });

    it("a password sign-up would refuse", async () => {
      const user = await signUp();
      const token = await requestToken(user.email);

      await reset(token, "short").expect(400);
      await login(user.email, oldPassword).expect(200);
    });

    // The stub this route replaced took an email and no token. With that
    // shape, anybody could have reset anybody's password.
    it("an email in place of a token", async () => {
      const user = await signUp();

      const { body } = await request(app.getHttpServer())
        .post("/auth/password/reset")
        .send({ email: user.email, password: newPassword })
        .expect(400);

      expect((body as { message: string[] }).message).toEqual(
        expect.arrayContaining(["property email should not exist"]),
      );
      await login(user.email, oldPassword).expect(200);
    });
  });
});
