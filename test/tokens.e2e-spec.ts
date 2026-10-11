import { createHash } from "node:crypto";

import { INestApplication } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types.js";
import { DataSource } from "typeorm";

import { configureApp } from "./../src/app-setup.js";
import { AppModule } from "./../src/app.module.js";
import authConfig from "./../src/auth/config/auth.config.js";
import { bearer } from "./auth-helpers.js";
import { listenOnLoopback } from "./listen-on-loopback.js";
import { signUp, type SignUpBody } from "./sign-up.js";

// Signing in, staying signed in, and being signed out, over real HTTP and the
// real database.
//
// A member holds two tokens. The access token is a JWT that goes with every
// request and lasts minutes. The refresh token is random text that is swapped,
// once, for a new pair. The unit specs fake the database, so only this file
// shows the table doing its part: one use for each token, and one winner when
// two requests arrive together.
//
// Needs the databases running and the migrations applied. Creates throwaway
// e2e- users. test/global-setup.ts deletes them when the run ends, and the
// foreign key's cascade takes their refresh tokens with them.
describe("Tokens (e2e)", () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let auth: ConfigType<typeof authConfig>;

  interface Pair {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }

  interface StoredToken {
    id: string;
    familyId: string;
    usedAt: string | null;
    revoked: boolean;
  }

  const refused = {
    statusCode: 401,
    message: "Invalid or expired refresh token",
    error: "Unauthorized",
    errorCode: "REFRESH_TOKEN_INVALID",
  };

  function signInAs(sent: SignUpBody) {
    return request(app.getHttpServer())
      .post("/auth/token")
      .send({ identifier: sent.email, password: sent.password });
  }

  function refresh(refreshToken: unknown) {
    return request(app.getHttpServer()).post("/auth/token/refresh").send({ refreshToken });
  }

  function whoAmI(accessToken: string) {
    return request(app.getHttpServer()).get("/users/me").set(bearer(accessToken));
  }

  /** A new member, signed in: what they sent at sign up, their id, and their first pair. */
  async function newSession(): Promise<{ sent: SignUpBody; userId: number; pair: Pair }> {
    const { sent, user } = await signUp(app);
    const { body } = await signInAs(sent).expect(200);
    return { sent, userId: user.id, pair: body as Pair };
  }

  /** The row for a refresh token, found the way the app finds it: by its hash. */
  async function storedToken(refreshToken: string): Promise<StoredToken | undefined> {
    const rows: StoredToken[] = await dataSource.query(
      `SELECT "id", "familyId", "usedAt", "revoked" FROM "refresh_token" WHERE "id" = $1`,
      [createHash("sha256").update(refreshToken).digest("hex")],
    );
    return rows[0];
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
    dataSource = app.get(DataSource);
    auth = app.get(authConfig.KEY);
  });

  afterAll(async () => {
    await app.close();
  });

  describe("signing in", () => {
    it("answers 200 with an access token, a refresh token and the access token's lifetime", async () => {
      const { sent } = await signUp(app);

      const { body } = await signInAs(sent).expect(200);

      expect(body).toEqual({
        // Three parts with dots between: a JWT.
        accessToken: expect.stringMatching(/^[\w-]+\.[\w-]+\.[\w-]+$/),
        // 43 URL-safe characters: 32 random bytes, and not a JWT.
        refreshToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
        expiresIn: auth.expiresIn,
      });
    });

    it("stores a hash of the refresh token, and not the token", async () => {
      const { pair } = await newSession();

      const rows: { id: string }[] = await dataSource.query(
        `SELECT "id" FROM "refresh_token" WHERE "id" = $1`,
        [pair.refreshToken],
      );

      expect(rows).toEqual([]);
      expect(await storedToken(pair.refreshToken)).toMatchObject({ usedAt: null, revoked: false });
    });

    it("starts a separate session for each sign-in", async () => {
      const { sent, pair: phone } = await newSession();
      const { body } = await signInAs(sent).expect(200);
      const laptop = body as Pair;

      const [first, second] = await Promise.all([
        storedToken(phone.refreshToken),
        storedToken(laptop.refreshToken),
      ]);

      expect(first?.familyId).not.toBe(second?.familyId);
    });
  });

  describe("refreshing", () => {
    it("swaps a refresh token for a new pair that works", async () => {
      const { userId, pair } = await newSession();

      const { body } = await refresh(pair.refreshToken).expect(200);
      const next = body as Pair;

      expect(next).toEqual({
        accessToken: expect.stringMatching(/^[\w-]+\.[\w-]+\.[\w-]+$/),
        refreshToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
        expiresIn: auth.expiresIn,
      });
      expect(next.refreshToken).not.toBe(pair.refreshToken);
      const me = await whoAmI(next.accessToken).expect(200);
      expect(me.body).toMatchObject({ id: userId });
    });

    it("keeps the new token in the same session, and marks the old one used", async () => {
      const { pair } = await newSession();
      const { body } = await refresh(pair.refreshToken).expect(200);

      const [old, successor] = await Promise.all([
        storedToken(pair.refreshToken),
        storedToken((body as Pair).refreshToken),
      ]);

      expect(old?.usedAt).not.toBeNull();
      expect(successor).toMatchObject({ familyId: old?.familyId, usedAt: null, revoked: false });
    });

    // A member who keeps coming back stays signed in: each new token can be
    // swapped in its turn.
    it("can be done again and again, each time with the newest token", async () => {
      const { pair } = await newSession();

      const second = (await refresh(pair.refreshToken).expect(200)).body as Pair;
      const third = (await refresh(second.refreshToken).expect(200)).body as Pair;

      await whoAmI(third.accessToken).expect(200);
    });
  });

  describe("a refresh token that is refused", () => {
    // None of these has the shape of a token, so no row could match. An
    // access token sent by mistake is among them.
    it.each([
      ["text that is not a token", "not-a-token"],
      ["a token nobody was given", "x".repeat(43)],
    ])("401 for %s", async (_what, value) => {
      const { body } = await refresh(value).expect(401);

      expect(body).toEqual(refused);
    });

    it("401 for an access token sent in its place", async () => {
      const { pair } = await newSession();

      const { body } = await refresh(pair.accessToken).expect(401);

      expect(body).toEqual(refused);
    });

    it.each([
      ["no refreshToken at all", undefined],
      ["an empty one", ""],
      ["a number", 42],
    ])("400 for a body with %s", async (_what, value) => {
      await refresh(value).expect(400);
    });

    // The member was away longer than a refresh token lasts. Nothing was
    // stolen, so the session is not ended: it has only run out for them.
    it("401 for a token past its time, which does not end the session", async () => {
      const { pair } = await newSession();
      await dataSource.query(
        `UPDATE "refresh_token" SET "expiresAt" = CURRENT_TIMESTAMP - INTERVAL '1 minute' WHERE "id" = $1`,
        [(await storedToken(pair.refreshToken))?.id],
      );

      const { body } = await refresh(pair.refreshToken).expect(401);

      expect(body).toEqual(refused);
      expect(await storedToken(pair.refreshToken)).toMatchObject({ usedAt: null, revoked: false });
    });

    it("401 once the member has closed their account", async () => {
      const { pair } = await newSession();
      await request(app.getHttpServer())
        .delete("/users/me")
        .set(bearer(pair.accessToken))
        .expect(204);

      const { body } = await refresh(pair.refreshToken).expect(401);

      expect(body).toEqual(refused);
    });
  });

  // A refresh token works once. If a used one comes back, two parties hold
  // it, the member and a thief, and nothing says which is which. So the whole
  // session ends and both sign in again.
  describe("a refresh token used twice", () => {
    it("ends the session: the second use is refused, and so is the newest token", async () => {
      const { pair } = await newSession();
      const next = (await refresh(pair.refreshToken).expect(200)).body as Pair;

      const second = await refresh(pair.refreshToken).expect(401);

      expect(second.body).toEqual(refused);
      // The token nobody has used yet belongs to the same session, so it is
      // dead too. Whoever holds it, member or thief, must sign in again.
      await refresh(next.refreshToken).expect(401);
      expect(await storedToken(next.refreshToken)).toMatchObject({ revoked: true });
    });

    it("leaves the member's other sessions alone", async () => {
      const { sent, pair: phone } = await newSession();
      const laptop = (await signInAs(sent).expect(200)).body as Pair;
      await refresh(phone.refreshToken).expect(200);
      await refresh(phone.refreshToken).expect(401);

      await refresh(laptop.refreshToken).expect(200);
    });

    // Two requests with one token at the same moment, as two browser tabs or
    // a retried request can send. Only the database can settle who was
    // first, with one conditional UPDATE. Exactly one wins, and because the
    // other is a second use, the session ends for both.
    it("lets only one of two requests sent together succeed, and ends the session", async () => {
      const { pair } = await newSession();

      const answers = await Promise.all([refresh(pair.refreshToken), refresh(pair.refreshToken)]);

      expect(answers.map((answer) => answer.status).sort((a, b) => a - b)).toEqual([200, 401]);
      const winner = answers.find((answer) => answer.status === 200)?.body as Pair;
      await refresh(winner.refreshToken).expect(401);
    });
  });

  // The two tokens are not interchangeable. Each is refused where the other
  // belongs.
  describe("a refresh token is not an access token", () => {
    it("401 when a refresh token is sent as the bearer token", async () => {
      const { pair } = await newSession();

      const { body } = await whoAmI(pair.refreshToken).expect(401);

      expect(body).toMatchObject({ errorCode: "TOKEN_INVALID" });
    });
  });
});
