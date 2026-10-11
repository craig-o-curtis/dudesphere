import { createHash, randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";

import { INestApplication } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Test, TestingModule } from "@nestjs/testing";
import { getUtcNow, subtractUtc } from "@northguild/gmt";
import request from "supertest";
import type { App } from "supertest/types.js";
import { DataSource } from "typeorm";

import { configureApp } from "./../src/app-setup.js";
import { AppModule } from "./../src/app.module.js";
import authConfig from "./../src/auth/config/auth.config.js";
import { RefreshTokensService } from "./../src/auth/refresh-tokens.service.js";
import { UserRole } from "./../src/users/user.entity.js";
import { UsersService } from "./../src/users/users.service.js";
import { bearer, tokenFor } from "./auth-helpers.js";
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

  function revoke(refreshToken: unknown) {
    return request(app.getHttpServer()).post("/auth/token/revoke").send({ refreshToken });
  }

  function revokeAll(accessToken?: string) {
    const post = request(app.getHttpServer()).post("/auth/token/revoke-all");
    return accessToken ? post.set(bearer(accessToken)) : post;
  }

  /** A session that has ended: neither of its tokens works any more. */
  async function expectSignedOut(pair: Pair) {
    const me = await whoAmI(pair.accessToken).expect(401);
    expect(me.body).toMatchObject({ errorCode: "TOKEN_INVALID" });
    await refresh(pair.refreshToken).expect(401);
  }

  /** A session that is still going: its access token works. */
  async function expectSignedIn(pair: Pair) {
    await whoAmI(pair.accessToken).expect(200);
  }

  /** A new member, signed in: what they sent at sign up, their id, and their first pair. */
  async function newSession(): Promise<{ sent: SignUpBody; userId: number; pair: Pair }> {
    const { sent, user } = await signUp(app);
    const { body } = await signInAs(sent).expect(200);
    return { sent, userId: user.id, pair: body as Pair };
  }

  /** A minute ago, by the app's clock, which is the clock the token code uses. */
  function aMinuteAgo(): string {
    return subtractUtc(getUtcNow(), { minutes: 1 });
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
    // The first is refused by its shape, with no query. The second has the
    // shape of a token, so it is looked up, and no row has its hash.
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
      await dataSource.query(`UPDATE "refresh_token" SET "expiresAt" = $1 WHERE "id" = $2`, [
        aMinuteAgo(),
        (await storedToken(pair.refreshToken))?.id,
      ]);

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

    // The access tokens have minutes left to run, and stop anyway: the guard
    // checks the session on every request. Without that, a thief would keep
    // what they stole until it expired.
    it("stops the session's access tokens on the next request", async () => {
      const { pair } = await newSession();
      const next = (await refresh(pair.refreshToken).expect(200)).body as Pair;
      await whoAmI(next.accessToken).expect(200);

      await refresh(pair.refreshToken).expect(401);

      const newest = await whoAmI(next.accessToken).expect(401);
      expect(newest.body).toMatchObject({ errorCode: "TOKEN_INVALID" });
      await whoAmI(pair.accessToken).expect(401);
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

  describe("signing out this device", () => {
    it("answers 204 with no body, and ends that session at once", async () => {
      const { pair } = await newSession();
      await expectSignedIn(pair);

      const response = await revoke(pair.refreshToken).expect(204);

      expect(response.text).toBe("");
      await expectSignedOut(pair);
    });

    it("leaves the member's other devices signed in", async () => {
      const { sent, pair: phone } = await newSession();
      const laptop = (await signInAs(sent).expect(200)).body as Pair;

      await revoke(phone.refreshToken).expect(204);

      await expectSignedOut(phone);
      await expectSignedIn(laptop);
      await refresh(laptop.refreshToken).expect(200);
    });

    // A client that kept an old token of the session can still sign out.
    it("works with a refresh token that was already spent", async () => {
      const { pair } = await newSession();
      const next = (await refresh(pair.refreshToken).expect(200)).body as Pair;

      await revoke(pair.refreshToken).expect(204);

      await expectSignedOut(next);
    });

    // The same answer whatever is sent, so the route cannot be used to find
    // out whether a token is real.
    it.each([
      ["a token nobody was given", "x".repeat(43)],
      ["text that is not a token", "not-a-token"],
    ])("answers 204 for %s too", async (_what, value) => {
      const response = await revoke(value).expect(204);

      expect(response.text).toBe("");
    });

    it("answers 204 again for a session that is already signed out", async () => {
      const { pair } = await newSession();
      await revoke(pair.refreshToken).expect(204);

      await revoke(pair.refreshToken).expect(204);
    });

    it("400 for a body with no refreshToken", async () => {
      await revoke(undefined).expect(400);
    });

    it("lets the member sign in again straight away", async () => {
      const { sent, pair } = await newSession();
      await revoke(pair.refreshToken).expect(204);

      const again = (await signInAs(sent).expect(200)).body as Pair;

      await expectSignedIn(again);
    });
  });

  describe("signing out every device", () => {
    it("401 with no access token", async () => {
      const { body } = await revokeAll().expect(401);

      expect(body).toMatchObject({ errorCode: "TOKEN_MISSING" });
    });

    it("answers 204 and ends every session of the caller, this one included", async () => {
      const { sent, pair: phone } = await newSession();
      const laptop = (await signInAs(sent).expect(200)).body as Pair;

      const response = await revokeAll(phone.accessToken).expect(204);

      expect(response.text).toBe("");
      await expectSignedOut(phone);
      await expectSignedOut(laptop);
    });

    it("leaves every other member signed in", async () => {
      const walter = await newSession();
      const donny = await newSession();

      await revokeAll(walter.pair.accessToken).expect(204);

      await expectSignedIn(donny.pair);
      await refresh(donny.pair.refreshToken).expect(200);
    });

    // Only the sessions that exist at that moment are ended.
    it("lets the member sign in again straight away", async () => {
      const { sent, pair } = await newSession();
      await revokeAll(pair.accessToken).expect(204);

      const again = (await signInAs(sent).expect(200)).body as Pair;

      await expectSignedIn(again);
      await refresh(again.refreshToken).expect(200);
    });
  });

  // Whoever was signed in with the old password signs in again with the new
  // one: the member on another device, or someone who should not be there.
  describe("changing the password", () => {
    it("ends every session of the member, on this device too", async () => {
      const { sent, pair: phone } = await newSession();
      const laptop = (await signInAs(sent).expect(200)).body as Pair;

      await request(app.getHttpServer())
        .patch("/users/me")
        .set(bearer(phone.accessToken))
        .send({ password: "a-new-secret-1", currentPassword: sent.password })
        .expect(200);

      await expectSignedOut(phone);
      await expectSignedOut(laptop);
      const again = await signInAs({ ...sent, password: "a-new-secret-1" }).expect(200);
      await expectSignedIn(again.body as Pair);
    });

    it("ends no session when only the username changes", async () => {
      const { pair } = await newSession();

      await request(app.getHttpServer())
        .patch("/users/me")
        .set(bearer(pair.accessToken))
        .send({ username: `e2e-${randomUUID().slice(0, 8)}` })
        .expect(200);

      await expectSignedIn(pair);
      await refresh(pair.refreshToken).expect(200);
    });
  });

  describe("closing the account", () => {
    it("ends every session of the member", async () => {
      const { sent, pair: phone } = await newSession();
      const laptop = (await signInAs(sent).expect(200)).body as Pair;

      await request(app.getHttpServer())
        .delete("/users/me")
        .set(bearer(phone.accessToken))
        .expect(204);

      // Read straight from the table, before anything else touches these
      // tokens. A refresh would also revoke the session, on finding the
      // account closed, and this must show that closing the account did it.
      expect(await storedToken(phone.refreshToken)).toMatchObject({ revoked: true });
      expect(await storedToken(laptop.refreshToken)).toMatchObject({ revoked: true });
      await expectSignedOut(phone);
      await expectSignedOut(laptop);
    });

    // An admin brings the account back. The member has to sign in to it:
    // the tokens they held when it was closed do not come back with it.
    //
    // Closing the account already ended the session, so on its own that
    // would prove nothing about the restore. The row is set back to "not
    // revoked" by hand, to stand for a session that slipped in around the
    // close. Restoring must end that one too.
    it("ends every session when an admin restores the account", async () => {
      const { sent, userId, pair } = await newSession();
      const familyId = (await storedToken(pair.refreshToken))?.familyId;
      await request(app.getHttpServer())
        .delete("/users/me")
        .set(bearer(pair.accessToken))
        .expect(204);
      await dataSource.query(`UPDATE "refresh_token" SET "revoked" = false WHERE "familyId" = $1`, [
        familyId,
      ]);

      await request(app.getHttpServer())
        .post(`/users/${userId}/restore`)
        .set(bearer(await tokenFor(app, UserRole.ADMIN)))
        .expect(200);

      expect(await storedToken(pair.refreshToken)).toMatchObject({ revoked: true });
      await expectSignedOut(pair);
      const again = (await signInAs(sent).expect(200)).body as Pair;
      await expectSignedIn(again);
    });
  });

  describe("an admin changing a member's password", () => {
    it("ends every session of that member", async () => {
      const { sent, userId, pair } = await newSession();

      await request(app.getHttpServer())
        .patch(`/users/${userId}`)
        .set(bearer(await tokenFor(app, UserRole.ADMIN)))
        .send({ password: "set-by-an-admin-1" })
        .expect(200);

      expect(await storedToken(pair.refreshToken)).toMatchObject({ revoked: true });
      await expectSignedOut(pair);
      const again = await signInAs({ ...sent, password: "set-by-an-admin-1" }).expect(200);
      await expectSignedIn(again.body as Pair);
    });
  });

  // A session lasts 30 days at most, however often it was renewed. The end
  // is on every row of the session, and nothing moves it.
  describe("a session that has reached its end", () => {
    /** Moves a session's end, and its tokens' own, a minute into the past. */
    async function endSessionOf(refreshToken: string) {
      const past = aMinuteAgo();
      await dataSource.query(
        `UPDATE "refresh_token" SET "familyExpiresAt" = $1, "expiresAt" = $1 WHERE "familyId" = $2`,
        [past, (await storedToken(refreshToken))?.familyId],
      );
    }

    // The access token still has minutes to run by its own expiry. The guard
    // checks the session's end on every request, so it stops with it.
    //
    // "Nothing was revoked" is checked by counting revoked rows, not by
    // reading the row. Another suite's sign-in may clear the row out at any
    // moment, now that it is past its end, and the count holds either way.
    it("refuses both of its tokens, though nothing was revoked", async () => {
      const { pair } = await newSession();
      const familyId = (await storedToken(pair.refreshToken))?.familyId;
      await expectSignedIn(pair);

      await endSessionOf(pair.refreshToken);

      const [{ revoked }] = (await dataSource.query(
        `SELECT count(*)::int AS "revoked" FROM "refresh_token" WHERE "familyId" = $1 AND "revoked" = true`,
        [familyId],
      )) as [{ revoked: number }];
      expect(revoked).toBe(0);
      await expectSignedOut(pair);
    });

    // The table's only housekeeping: saving any new token clears out the
    // rows of every session that has run out, whoever they belonged to.
    it("has its rows cleared out the next time anybody signs in", async () => {
      const { pair } = await newSession();
      await endSessionOf(pair.refreshToken);

      await newSession();

      expect(await storedToken(pair.refreshToken)).toBeUndefined();
    });

    it("leaves the rows of a session that is still going", async () => {
      const { pair } = await newSession();

      await newSession();

      expect(await storedToken(pair.refreshToken)).toBeDefined();
    });
  });

  // The statements that settle "who was first", run against the real
  // database through the service, where nothing else can explain the result.
  describe("the one-winner statements", () => {
    // Two requests with one token both read it as unused. This UPDATE is what
    // lets only one of them spend it. Whether the two overlap or run one
    // after the other, exactly one must be told it won.
    it("lets exactly one of two calls mark a token used", async () => {
      const { pair } = await newSession();
      const id = (await storedToken(pair.refreshToken))?.id ?? "";
      const refreshTokens = app.get(RefreshTokensService);

      const results = await Promise.all([
        refreshTokens.markUsed(id, getUtcNow()),
        refreshTokens.markUsed(id, getUtcNow()),
      ]);

      expect(results.filter(Boolean)).toHaveLength(1);
      expect(await refreshTokens.markUsed(id, getUtcNow())).toBe(false);
    });

    // What sign-in asks once it has started a session: is the password that
    // was checked still the member's? It reads the row with a share lock, so
    // only the real database can show the statement is one Postgres accepts.
    it("tells sign-in whether the password it checked is still the member's", async () => {
      const { sent, userId, pair } = await newSession();
      const users = app.get(UsersService);
      const [{ password: hash }] = (await dataSource.query(
        `SELECT "password" FROM "user" WHERE "id" = $1`,
        [userId],
      )) as [{ password: string }];

      expect(await users.credentialsStillHold(userId, hash)).toBe(true);
      expect(await users.credentialsStillHold(userId, "not-the-stored-hash")).toBe(false);

      await request(app.getHttpServer())
        .patch("/users/me")
        .set(bearer(pair.accessToken))
        .send({ password: "a-new-secret-2", currentPassword: sent.password })
        .expect(200);

      // The old hash no longer holds, so a sign-in that had been checking the
      // old password would end the session it started.
      expect(await users.credentialsStillHold(userId, hash)).toBe(false);
    });

    // The lock is what makes the recheck wait for a password change that has
    // written the new hash and not yet committed. Without it the recheck
    // would read the old hash, answer "still holds", and let the session
    // through. Here the change is held open by hand, and the recheck must
    // still be waiting a fifth of a second later.
    it("makes the recheck wait for a password change that is in flight", async () => {
      const { userId } = await newSession();
      const [{ password: oldHash }] = (await dataSource.query(
        `SELECT "password" FROM "user" WHERE "id" = $1`,
        [userId],
      )) as [{ password: string }];
      const users = app.get(UsersService);
      let settled = false;
      let recheck: Promise<boolean> = Promise.resolve(true);

      await dataSource.transaction(async (manager) => {
        await manager.query(`UPDATE "user" SET "password" = $1 WHERE "id" = $2`, [
          "a-hash-that-is-not-the-old-one",
          userId,
        ]);

        recheck = users.credentialsStillHold(userId, oldHash).finally(() => {
          settled = true;
        });
        await pause(200);

        // Still waiting on the row lock this transaction holds.
        expect(settled).toBe(false);
      });

      // The change has committed. The recheck now sees the new hash.
      await expect(recheck).resolves.toBe(false);
    });

    it("says the credentials no longer hold once the account is closed", async () => {
      const { userId, pair } = await newSession();
      const [{ password: hash }] = (await dataSource.query(
        `SELECT "password" FROM "user" WHERE "id" = $1`,
        [userId],
      )) as [{ password: string }];

      await request(app.getHttpServer())
        .delete("/users/me")
        .set(bearer(pair.accessToken))
        .expect(204);

      expect(await app.get(UsersService).credentialsStillHold(userId, hash)).toBe(false);
    });
  });

  // `pnpm dev:token` signs a token for a member with no sign-in behind it, so
  // it names no session. Only the app can sign one, so the guard lets it
  // through with the user check alone.
  describe("a token that belongs to no session", () => {
    it("still works, as the dev token command needs", async () => {
      const { sent, userId } = await newSession();

      const token = await app.get(JwtService).signAsync({ sub: userId, username: sent.username });

      const me = await whoAmI(token).expect(200);
      expect(me.body).toMatchObject({ id: userId });
    });
  });

  // The routes these replaced. Signing in is POST /auth/token and signing out
  // is POST /auth/token/revoke.
  it.each(["/auth/login", "/auth/logout"])("POST %s is not a route any more", async (path) => {
    await request(app.getHttpServer()).post(path).send({}).expect(404);
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
