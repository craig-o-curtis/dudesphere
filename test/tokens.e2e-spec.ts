import { createHash, randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";

import {
  AUTHENTICATION_MODULE_OPTIONS,
  type AuthenticationModuleOptions,
  JwtSigner,
} from "@nestjs/authentication";
import { INestApplication } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { getUtcNow, subtractUtc } from "@northguild/gmt";
import * as bcrypt from "bcrypt";
import request from "supertest";
import type { App } from "supertest/types.js";
import { DataSource } from "typeorm";

import { configureApp } from "./../src/app-setup.js";
import { AppModule } from "./../src/app.module.js";
import authConfig from "./../src/auth/config/auth.config.js";
import { UserRole } from "./../src/users/user.entity.js";
import { UsersRepository } from "./../src/users/users.repository.js";
import { bearer, claimsOf, tokenFor } from "./auth-helpers.js";
import { listenOnLoopback } from "./listen-on-loopback.js";
import { signUp, type SignUpBody } from "./sign-up.js";

// Signing in, staying signed in, and signing out, over real HTTP and the real
// database: the routes of TokensController and SessionsController, on
// @nestjs/authentication's TokenService. See "Issue tokens to the mobile app"
// on https://docs.nestjs.com/security/authentication.
//
// A member holds two tokens. The access token is a JWT that goes with every
// request and lasts minutes. The refresh token is random text that is swapped,
// once, for a new pair. The refresh tokens of one sign-in form a family.
//
// What a sign-out ends is the family. Every access token carries its
// sign-in's id, `sid`, and JwtAuth.validate checks on every request that the
// sign-in is still going. So an access token stops on the next request after
// its family ends. The docs alone would let it run to its expiry; that check
// is this app's own.
//
// The store's own rules, such as one winner when two requests spend one
// token, are also proved by the package's contract suite in
// test/typeorm-authentication.store.e2e-spec.ts.
//
// Needs the databases running and the migrations applied. Creates throwaway
// e2e- users. test/global-setup.ts deletes them and their tokens when the run
// ends.
describe("Tokens (e2e)", () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let auth: ConfigType<typeof authConfig>;

  interface Pair {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }

  // A refresh token's row, found by its hash.
  interface StoredToken {
    family_id: string;
    used_at: string | null;
    revoked: boolean;
  }

  // The package's answers to a refresh token it will not swap.
  function refused(reason: "invalid" | "expired" | "reused") {
    return { statusCode: 401, message: `Refresh token ${reason}`, error: "Unauthorized" };
  }

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

  /**
   * An access token with these claims, signed with the app's own key, as
   * TokenService would sign it. Lets a case pick the claims, so that only
   * the check it is about can refuse the token.
   */
  function signedWith(claims: Record<string, unknown>): string {
    const { accessToken } = app.get<AuthenticationModuleOptions>(AUTHENTICATION_MODULE_OPTIONS);
    return new JwtSigner(accessToken!).sign(claims);
  }

  function revoke(refreshToken: unknown) {
    return request(app.getHttpServer()).post("/auth/token/revoke").send({ refreshToken });
  }

  function signOutEverywhere(accessToken?: string) {
    const post = request(app.getHttpServer()).post("/auth/sign-out-everywhere");
    return accessToken ? post.set(bearer(accessToken)) : post;
  }

  /** A new member, signed in: what they sent at sign up, their id, and their first pair. */
  async function newSession(): Promise<{ sent: SignUpBody; userId: number; pair: Pair }> {
    const { sent, user } = await signUp(app);
    const { body } = await signInAs(sent).expect(200);
    return { sent, userId: user.id, pair: body as Pair };
  }

  /** A minute ago, by the app's clock. */
  function aMinuteAgo(): string {
    return subtractUtc(getUtcNow(), { minutes: 1 });
  }

  /** The id a refresh token is stored under: its SHA-256, in base64url. */
  function idOf(refreshToken: string): string {
    return createHash("sha256").update(refreshToken).digest("base64url");
  }

  /** The row for a refresh token. Undefined when there is none. */
  async function storedToken(refreshToken: string): Promise<StoredToken | undefined> {
    const rows: StoredToken[] = await dataSource.query(
      `SELECT family_id, used_at, revoked FROM refresh_tokens WHERE id = $1`,
      [idOf(refreshToken)],
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

      const rows: unknown[] = await dataSource.query(`SELECT 1 FROM refresh_tokens WHERE id = $1`, [
        pair.refreshToken,
      ]);

      expect(rows).toEqual([]);
      expect(await storedToken(pair.refreshToken)).toMatchObject({ used_at: null, revoked: false });
    });

    it("starts a separate family for each sign-in", async () => {
      const { sent, pair: phone } = await newSession();
      const laptop = (await signInAs(sent).expect(200)).body as Pair;

      const [first, second] = await Promise.all([
        storedToken(phone.refreshToken),
        storedToken(laptop.refreshToken),
      ]);

      expect(first?.family_id).not.toBe(second?.family_id);
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

    it("keeps the new token in the same family, and marks the old one used", async () => {
      const { pair } = await newSession();
      const { body } = await refresh(pair.refreshToken).expect(200);

      const [old, successor] = await Promise.all([
        storedToken(pair.refreshToken),
        storedToken((body as Pair).refreshToken),
      ]);

      expect(old?.used_at).not.toBeNull();
      expect(successor).toMatchObject({ family_id: old?.family_id, used_at: null, revoked: false });
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

      expect(body).toEqual(refused("invalid"));
    });

    it("401 for an access token sent in its place", async () => {
      const { pair } = await newSession();

      const { body } = await refresh(pair.accessToken).expect(401);

      expect(body).toEqual(refused("invalid"));
    });

    it.each([
      ["no refreshToken at all", undefined],
      ["an empty one", ""],
      ["a number", 42],
    ])("400 for a body with %s", async (_what, value) => {
      await refresh(value).expect(400);
    });

    // The member was away longer than a refresh token lasts. Nothing was
    // stolen, so the token is not spent and the family is not ended: it has
    // only run out for them.
    it("401 for a token past its time, which spends nothing", async () => {
      const { pair } = await newSession();
      await dataSource.query(`UPDATE refresh_tokens SET expires_at = $1 WHERE id = $2`, [
        aMinuteAgo(),
        idOf(pair.refreshToken),
      ]);

      const { body } = await refresh(pair.refreshToken).expect(401);

      expect(body).toEqual(refused("expired"));
      expect(await storedToken(pair.refreshToken)).toMatchObject({ used_at: null, revoked: false });
    });

    // A family lasts REFRESH_TOKEN_ABSOLUTE_EXPIRES_IN at most, however often
    // its tokens were swapped.
    it("401 for a family past its absolute end", async () => {
      const { pair } = await newSession();
      await dataSource.query(
        `UPDATE refresh_tokens SET family_expires_at = $1 WHERE family_id = $2`,
        [aMinuteAgo(), (await storedToken(pair.refreshToken))?.family_id],
      );

      const { body } = await refresh(pair.refreshToken).expect(401);

      expect(body).toEqual(refused("expired"));
    });

    it("401 once the member has closed their account", async () => {
      const { pair } = await newSession();
      await request(app.getHttpServer())
        .delete("/users/me")
        .set(bearer(pair.accessToken))
        .expect(204);

      const { body } = await refresh(pair.refreshToken).expect(401);

      expect(body).toEqual(refused("invalid"));
    });

    // The backstop behind the case above. Closing an account ends its
    // families, so a refresh is normally refused. Here the account is marked
    // closed straight in the table, with its family left going, to stand for
    // one that slipped through. TokenService does not read the user, so it
    // swaps the token. The new access token is still worth nothing: JwtAuth
    // finds no member for it.
    it("hands a closed account whose family was left going tokens that do not work", async () => {
      const { userId, pair } = await newSession();
      await dataSource.query(`UPDATE "user" SET "deletedAt" = now() WHERE "id" = $1`, [userId]);

      const next = (await refresh(pair.refreshToken).expect(200)).body as Pair;

      await whoAmI(next.accessToken).expect(401);
    });
  });

  // A refresh token works once. If a used one comes back, two parties hold
  // it, the member and a thief, and nothing says which is which. So the whole
  // family ends and both sign in again.
  describe("a refresh token used twice", () => {
    it("ends the family: the second use is refused, and so is the newest token", async () => {
      const { pair } = await newSession();
      const next = (await refresh(pair.refreshToken).expect(200)).body as Pair;

      const second = await refresh(pair.refreshToken).expect(401);

      expect(second.body).toEqual(refused("reused"));
      // The token nobody has used yet belongs to the same family, so it is
      // dead too. Whoever holds it, member or thief, must sign in again.
      const newest = await refresh(next.refreshToken).expect(401);
      expect(newest.body).toEqual(refused("invalid"));
      expect(await storedToken(next.refreshToken)).toMatchObject({ revoked: true });
    });

    // The access tokens stop too, on the next request: each carries the
    // family's `sid`, and JwtAuth finds that sign-in ended. A thief keeps
    // nothing.
    it("stops the family's access tokens on the next request", async () => {
      const { pair } = await newSession();
      const next = (await refresh(pair.refreshToken).expect(200)).body as Pair;
      await whoAmI(next.accessToken).expect(200);

      await refresh(pair.refreshToken).expect(401);

      await whoAmI(next.accessToken).expect(401);
      await whoAmI(pair.accessToken).expect(401);
    });

    it("leaves the member's other sign-ins alone", async () => {
      const { sent, pair: phone } = await newSession();
      const laptop = (await signInAs(sent).expect(200)).body as Pair;
      await refresh(phone.refreshToken).expect(200);
      await refresh(phone.refreshToken).expect(401);

      await refresh(laptop.refreshToken).expect(200);
    });

    // Two requests with one token at the same moment, as two browser tabs or
    // a retried request can send. Only the database can settle who was
    // first, with one conditional UPDATE. Exactly one wins, and because the
    // other is a second use, the family ends for both.
    it("lets only one of two requests sent together succeed, and ends the family", async () => {
      const { pair } = await newSession();

      const answers = await Promise.all([refresh(pair.refreshToken), refresh(pair.refreshToken)]);

      expect(answers.map((answer) => answer.status).sort((a, b) => a - b)).toEqual([200, 401]);
      const winner = answers.find((answer) => answer.status === 200)?.body as Pair;
      await refresh(winner.refreshToken).expect(401);
    });
  });

  describe("signing out this device", () => {
    it("answers 204 with no body, and ends that family at once", async () => {
      const { pair } = await newSession();

      const response = await revoke(pair.refreshToken).expect(204);

      expect(response.text).toBe("");
      await refresh(pair.refreshToken).expect(401);
      expect(await storedToken(pair.refreshToken)).toMatchObject({ revoked: true });
    });

    // The access token stops with its refresh tokens, on the next request.
    it("stops the device's access token on the next request", async () => {
      const { pair } = await newSession();
      await whoAmI(pair.accessToken).expect(200);

      await revoke(pair.refreshToken).expect(204);

      const refusedMe = await whoAmI(pair.accessToken).expect(401);
      expect(refusedMe.body).toMatchObject({ statusCode: 401, message: "unknown subject" });
    });

    it("leaves the access token of the member's other device working", async () => {
      const { sent, pair: phone } = await newSession();
      const laptop = (await signInAs(sent).expect(200)).body as Pair;

      await revoke(phone.refreshToken).expect(204);

      await whoAmI(laptop.accessToken).expect(200);
    });

    it("leaves the member's other devices signed in", async () => {
      const { sent, pair: phone } = await newSession();
      const laptop = (await signInAs(sent).expect(200)).body as Pair;

      await revoke(phone.refreshToken).expect(204);

      await refresh(phone.refreshToken).expect(401);
      await refresh(laptop.refreshToken).expect(200);
    });

    // A client that kept an old token of the family can still sign out.
    it("works with a refresh token that was already spent", async () => {
      const { pair } = await newSession();
      const next = (await refresh(pair.refreshToken).expect(200)).body as Pair;

      await revoke(pair.refreshToken).expect(204);

      await refresh(next.refreshToken).expect(401);
    });

    // The same answer whatever is sent, so the route cannot be used to find
    // out whether a token is real. RFC 7009 asks for this.
    it.each([
      ["a token nobody was given", "x".repeat(43)],
      ["text that is not a token", "not-a-token"],
    ])("answers 204 for %s too", async (_what, value) => {
      const response = await revoke(value).expect(204);

      expect(response.text).toBe("");
    });

    it("answers 204 again for a family that is already signed out", async () => {
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

      await refresh(again.refreshToken).expect(200);
    });
  });

  describe("signing out every device", () => {
    it("401 with no access token", async () => {
      const { body } = await signOutEverywhere().expect(401);

      expect(body).toMatchObject({ errorCode: "missing_credentials" });
    });

    it("answers 204 and ends every family of the caller, this one included", async () => {
      const { sent, pair: phone } = await newSession();
      const laptop = (await signInAs(sent).expect(200)).body as Pair;

      const response = await signOutEverywhere(phone.accessToken).expect(204);

      expect(response.text).toBe("");
      await refresh(phone.refreshToken).expect(401);
      await refresh(laptop.refreshToken).expect(401);
      // The access tokens of both devices stop at once too.
      await whoAmI(phone.accessToken).expect(401);
      await whoAmI(laptop.accessToken).expect(401);
    });

    it("leaves every other member signed in", async () => {
      const walter = await newSession();
      const donny = await newSession();

      await signOutEverywhere(walter.pair.accessToken).expect(204);

      await whoAmI(donny.pair.accessToken).expect(200);
      await refresh(donny.pair.refreshToken).expect(200);
    });

    // Only the families that exist at that moment are ended.
    it("lets the member sign in again straight away", async () => {
      const { sent, pair } = await newSession();
      await signOutEverywhere(pair.accessToken).expect(204);

      const again = (await signInAs(sent).expect(200)).body as Pair;

      await refresh(again.refreshToken).expect(200);
    });
  });

  // Whoever was signed in with the old password signs in again with the new
  // one: the member on another device, or someone who should not be there.
  // test/passwords.e2e-spec.ts shows the access tokens from before the change
  // stop too.
  describe("changing the password", () => {
    it("ends every family of the member, on this device too", async () => {
      const { sent, pair: phone } = await newSession();
      const laptop = (await signInAs(sent).expect(200)).body as Pair;

      await request(app.getHttpServer())
        .patch("/users/me")
        .set(bearer(phone.accessToken))
        .send({ password: "a-new-secret-1", currentPassword: sent.password })
        .expect(200);

      await refresh(phone.refreshToken).expect(401);
      await refresh(laptop.refreshToken).expect(401);
      // Both access tokens stop at once, even one signed in the same second
      // as the change: their sign-ins were ended in the same transaction.
      await whoAmI(phone.accessToken).expect(401);
      await whoAmI(laptop.accessToken).expect(401);
      const again = await signInAs({ ...sent, password: "a-new-secret-1" }).expect(200);
      await refresh((again.body as Pair).refreshToken).expect(200);
    });

    it("ends no family when only the username changes", async () => {
      const { pair } = await newSession();

      await request(app.getHttpServer())
        .patch("/users/me")
        .set(bearer(pair.accessToken))
        .send({ username: `e2e-${randomUUID().slice(0, 8)}` })
        .expect(200);

      await whoAmI(pair.accessToken).expect(200);
      await refresh(pair.refreshToken).expect(200);
    });
  });

  describe("closing the account", () => {
    it("ends every family of the member, and their access tokens", async () => {
      const { sent, pair: phone } = await newSession();
      const laptop = (await signInAs(sent).expect(200)).body as Pair;

      await request(app.getHttpServer())
        .delete("/users/me")
        .set(bearer(phone.accessToken))
        .expect(204);

      expect(await storedToken(phone.refreshToken)).toMatchObject({ revoked: true });
      expect(await storedToken(laptop.refreshToken)).toMatchObject({ revoked: true });
      // JwtAuth finds no live member, so the access tokens stop at once.
      await whoAmI(phone.accessToken).expect(401);
      await whoAmI(laptop.accessToken).expect(401);
    });

    // An admin brings the account back. The member has to sign in to it:
    // the tokens they held when it was closed do not come back with it.
    //
    // Closing the account already ended the family, so on its own that would
    // prove nothing about the restore. The family is set back to "not ended"
    // by hand, to stand for one that slipped in around the close. Restoring
    // must end that one too.
    it("ends every family when an admin restores the account", async () => {
      const { sent, userId, pair } = await newSession();
      await request(app.getHttpServer())
        .delete("/users/me")
        .set(bearer(pair.accessToken))
        .expect(204);
      await dataSource.query(`UPDATE refresh_tokens SET revoked = false WHERE user_id = $1`, [
        String(userId),
      ]);

      await request(app.getHttpServer())
        .post(`/users/${userId}/restore`)
        .set(bearer(await tokenFor(app, UserRole.ADMIN)))
        .expect(200);

      expect(await storedToken(pair.refreshToken)).toMatchObject({ revoked: true });
      await refresh(pair.refreshToken).expect(401);
      // A restore no longer brings back a recent access token: its sign-in
      // is ended.
      await whoAmI(pair.accessToken).expect(401);
      const again = (await signInAs(sent).expect(200)).body as Pair;
      await whoAmI(again.accessToken).expect(200);
    });
  });

  describe("an admin changing a member's password", () => {
    it("ends every family of that member", async () => {
      const { sent, userId, pair } = await newSession();

      await request(app.getHttpServer())
        .patch(`/users/${userId}`)
        .set(bearer(await tokenFor(app, UserRole.ADMIN)))
        .send({ password: "set-by-an-admin-1" })
        .expect(200);

      expect(await storedToken(pair.refreshToken)).toMatchObject({ revoked: true });
      await refresh(pair.refreshToken).expect(401);
      await whoAmI(pair.accessToken).expect(401);
      // The same sign-in, in a token signed after the change. The password
      // check lets it through, so only the ended sign-in refuses it.
      await whoAmI(signedWith({ sub: String(userId), sid: claimsOf(pair.accessToken).sid })).expect(
        401,
      );
      const again = await signInAs({ ...sent, password: "set-by-an-admin-1" }).expect(200);
      await whoAmI((again.body as Pair).accessToken).expect(200);
    });
  });

  // What sign-in asks once it has started: has the password changed, or the
  // account closed, since the password was checked? See
  // UsersRepository.signInStillValid. It reads the row with a share lock, so
  // only the real database can show it works.
  describe("the sign-in recheck", () => {
    async function stampOf(userId: number): Promise<string | null> {
      const user = await app.get(UsersRepository).findById(userId);
      return user?.passwordChangedAt ?? null;
    }

    it("holds until the password changes", async () => {
      const { sent, userId, pair } = await newSession();
      const users = app.get(UsersRepository);
      const stamp = await stampOf(userId);

      expect(await users.signInStillValid(userId, stamp)).toBe(true);

      await request(app.getHttpServer())
        .patch("/users/me")
        .set(bearer(pair.accessToken))
        .send({ password: "a-new-long-secret-2", currentPassword: sent.password })
        .expect(200);

      // A sign-in that had been checking the old password would now end the
      // sign-in it started.
      expect(await users.signInStillValid(userId, stamp)).toBe(false);
    });

    // The lock is what makes the recheck wait for a password change that has
    // written the new stamp and not yet committed. Without it the recheck
    // would read the old stamp, answer "still valid", and let the sign-in
    // through. Here the change is held open by hand, and the recheck must
    // still be waiting a fifth of a second later.
    it("waits for a password change that is in flight", async () => {
      const { userId } = await newSession();
      const stamp = await stampOf(userId);
      const users = app.get(UsersRepository);
      let settled = false;
      let recheck: Promise<boolean> = Promise.resolve(true);

      await dataSource.transaction(async (manager) => {
        await manager.query(`UPDATE "user" SET "passwordChangedAt" = $1 WHERE "id" = $2`, [
          getUtcNow(),
          userId,
        ]);

        recheck = users.signInStillValid(userId, stamp).finally(() => {
          settled = true;
        });
        await pause(200);

        // Still waiting on the row lock this transaction holds.
        expect(settled).toBe(false);
      });

      // The change has committed. The recheck now sees the new stamp.
      await expect(recheck).resolves.toBe(false);
    });

    it("fails once the account is closed", async () => {
      const { userId, pair } = await newSession();
      const stamp = await stampOf(userId);

      await request(app.getHttpServer())
        .delete("/users/me")
        .set(bearer(pair.accessToken))
        .expect(204);

      expect(await app.get(UsersRepository).signInStillValid(userId, stamp)).toBe(false);
    });

    // Upgrading an old bcrypt hash at sign-in changes the hash, not the
    // stamp, so it must not count as a password change and refuse the
    // member's own sign-in.
    it("lets a member with an old bcrypt hash sign in", async () => {
      const { sent, userId } = await newSession();
      await dataSource.query(`UPDATE "user" SET "password" = $1 WHERE "id" = $2`, [
        await bcrypt.hash(sent.password, 4),
        userId,
      ]);

      const { body } = await signInAs(sent).expect(200);

      await whoAmI((body as Pair).accessToken).expect(200);
    });
  });

  // A token with no `sid` belongs to no sign-in. JwtAuth lets one through
  // only when it is marked as a dev token.
  describe("a token that belongs to no sign-in", () => {
    // What `pnpm dev:token` signs.
    it("works when it is marked as a dev token", async () => {
      const { userId } = await newSession();

      const me = await whoAmI(signedWith({ sub: String(userId), amr: ["dev"] })).expect(200);
      expect(me.body).toMatchObject({ id: userId });
    });

    // Signed with the app's own key, so only the missing `sid` refuses it.
    it("is refused without the dev mark", async () => {
      const { userId } = await newSession();

      await whoAmI(signedWith({ sub: String(userId), amr: ["pwd"] })).expect(401);
    });

    it("is refused with no sid and no amr", async () => {
      const { userId } = await newSession();

      await whoAmI(signedWith({ sub: String(userId) })).expect(401);
    });

    it("is refused with a sid that belongs to no sign-in", async () => {
      const { userId } = await newSession();

      await whoAmI(signedWith({ sub: String(userId), sid: randomUUID() })).expect(401);
    });

    // TokensController only makes UUIDs, so JwtAuth refuses anything else
    // without asking the database.
    it("is refused with a sid that is not a UUID", async () => {
      const { userId } = await newSession();

      await whoAmI(signedWith({ sub: String(userId), sid: "not-a-uuid" })).expect(401);
    });
  });

  // What SignInsRepository.isLive asks, beyond "was it revoked": the cases
  // the sign-out tests above do not reach.
  describe("an access token's sign-in", () => {
    // A family lasts REFRESH_TOKEN_ABSOLUTE_EXPIRES_IN at most. Its access
    // tokens stop then too, not only its refresh tokens.
    it("401 once its family is past its absolute end", async () => {
      const { pair } = await newSession();
      await whoAmI(pair.accessToken).expect(200);
      await dataSource.query(
        `UPDATE refresh_tokens SET family_expires_at = $1 WHERE family_id = $2`,
        [aMinuteAgo(), (await storedToken(pair.refreshToken))?.family_id],
      );

      await whoAmI(pair.accessToken).expect(401);
    });

    // A live sign-in, but another member's. The token is signed with the
    // app's key, so only the sid's owner refuses it.
    it("401 with another member's sid", async () => {
      const mine = await newSession();
      const theirs = await newSession();

      await whoAmI(
        signedWith({ sub: String(mine.userId), sid: claimsOf(theirs.pair.accessToken).sid }),
      ).expect(401);
      await whoAmI(theirs.pair.accessToken).expect(200);
    });
  });

  // The paths these routes had before. Signing in is POST /auth/token,
  // refreshing is POST /auth/token/refresh, signing out is
  // POST /auth/token/revoke or POST /auth/sign-out-everywhere, signing up is
  // POST /auth/sign-up, and a reset is POST /auth/password/forgot and
  // POST /auth/password/reset.
  it.each([
    "/auth/login",
    "/auth/refresh",
    "/auth/logout",
    "/auth/logout-all",
    "/auth/signup",
    "/auth/forgot-password",
    "/auth/reset-password",
  ])("POST %s is not a route any more", async (path) => {
    await request(app.getHttpServer()).post(path).send({}).expect(404);
  });

  // The two tokens are not interchangeable. Each is refused where the other
  // belongs.
  describe("a refresh token is not an access token", () => {
    it("401 when a refresh token is sent as the bearer token", async () => {
      const { pair } = await newSession();

      const response = await whoAmI(pair.refreshToken).expect(401);

      expect(response.headers["www-authenticate"]).toContain('error="invalid_token"');
    });
  });
});
