import { randomUUID } from "node:crypto";

import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types.js";

import { configureApp } from "./../src/app-setup.js";
import { AppModule } from "./../src/app.module.js";
import { bearer } from "./auth-helpers.js";
import { listenOnLoopback } from "./listen-on-loopback.js";
import { signUp, signUpBody, type SignUpBody } from "./sign-up.js";

// A display name is the one name other members see. It is required at sign
// up and unique, ignoring letter case. The case part and the unique part are
// Postgres's doing: the column is citext with a unique constraint. A unit
// test with a mocked repository cannot show either, so they are proved here
// against the real database.
//
// Needs the databases running and the migrations applied. Creates throwaway
// e2e- users. test/global-setup.ts deletes them when the run ends.
describe("Display names (e2e)", () => {
  let app: INestApplication<App>;

  // One member whose name the other tests try to take.
  let walter: { sent: SignUpBody; token: string; userId: number; displayName: string };

  const DISPLAY_NAME_TAKEN = {
    statusCode: 409,
    message: "Display name already taken",
    error: "Conflict",
    errorCode: "DISPLAY_NAME_TAKEN",
  };

  /** A display name no other run has used. The tag is 8 hex characters. */
  function freshName(): string {
    return `e2e Name ${randomUUID().slice(0, 8)}`;
  }

  function postSignUp(body: object) {
    return request(app.getHttpServer()).post("/auth/signup").send(body);
  }

  async function logIn(sent: SignUpBody): Promise<{ token: string; userId: number }> {
    const { body } = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ identifier: sent.email, password: sent.password })
      .expect(201);
    return body as { token: string; userId: number };
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

    const displayName = freshName();
    const { sent } = await signUp(app, { profile: { displayName } });
    walter = { sent, displayName, ...(await logIn(sent)) };
  });

  afterAll(async () => {
    await app.close();
  });

  describe("sign up needs one", () => {
    it("400 with no profile at all", async () => {
      const { profile: _profile, ...account } = signUpBody();

      const { body } = await postSignUp(account).expect(400);

      expect((body as { message: string[] }).message).toContain(
        "profile should not be null or undefined",
      );
    });

    it("400 for a profile with no display name", async () => {
      const { body } = await postSignUp({ ...signUpBody(), profile: { bio: "abides" } }).expect(
        400,
      );

      expect((body as { message: string[] }).message).toEqual(
        expect.arrayContaining([expect.stringContaining("displayName")]),
      );
    });

    it("stores the name cleaned, and returns it that way", async () => {
      const displayName = freshName();

      const { user } = await signUp(app, {
        profile: { displayName: `   ${displayName.replace(" Name ", "   Name\t")}  ` },
      });

      expect(user.profile.displayName).toBe(displayName);
    });

    // It looks exactly like a name without it, so it would get past the
    // unique rule as a second name.
    it("400 for a name with a character nobody can see", async () => {
      const { body } = await postSignUp(
        signUpBody({ profile: { displayName: `e2e​Name ${randomUUID().slice(0, 8)}` } }),
      ).expect(400);

      expect((body as { message: string[] }).message).toContain(
        "profile.displayName must not contain invisible or control characters",
      );
    });
  });

  describe("a name in use cannot be taken at sign up", () => {
    it.each([
      ["as it is", (name: string) => name],
      ["in capitals", (name: string) => name.toUpperCase()],
      ["in lower case", (name: string) => name.toLowerCase()],
      ["with different spacing", (name: string) => `  ${name.replaceAll(" ", "   ")} `],
    ])("409 DISPLAY_NAME_TAKEN %s", async (_what, spell) => {
      const { body } = await postSignUp(
        signUpBody({ profile: { displayName: spell(walter.displayName) } }),
      ).expect(409);

      expect(body).toEqual(DISPLAY_NAME_TAKEN);
    });

    // The check runs before anything is written, so the refused sign up
    // leaves no account behind.
    it("creates no user when it refuses", async () => {
      const sent = signUpBody({ profile: { displayName: walter.displayName } });
      await postSignUp(sent).expect(409);

      await request(app.getHttpServer())
        .post("/auth/login")
        .send({ identifier: sent.email, password: sent.password })
        .expect(401);
    });

    // One answer at a time, account fields first.
    it("names the email, not the display name, when both are taken", async () => {
      const { body } = await postSignUp(
        signUpBody({ email: walter.sent.email, profile: { displayName: walter.displayName } }),
      ).expect(409);

      expect(body).toMatchObject({ errorCode: "EMAIL_TAKEN" });
    });

    // The unique constraint still covers a soft-deleted profile, so a member
    // who is restored gets their name back, and nobody can take it meanwhile.
    it("keeps a deleted member's name reserved", async () => {
      const displayName = freshName();
      const { sent } = await signUp(app, { profile: { displayName } });
      const { token } = await logIn(sent);
      await request(app.getHttpServer()).delete("/users/me").set(bearer(token)).expect(204);

      const { body } = await postSignUp(signUpBody({ profile: { displayName } })).expect(409);

      expect(body).toEqual(DISPLAY_NAME_TAKEN);
    });
  });

  describe("changing it through PATCH /profiles/me", () => {
    let donny: { token: string; userId: number };

    function patchMine(token: string, body: object) {
      return request(app.getHttpServer()).patch("/profiles/me").set(bearer(token)).send(body);
    }

    beforeAll(async () => {
      const { sent } = await signUp(app);
      donny = await logIn(sent);
    });

    it("200 for a free name, cleaned like sign up", async () => {
      const displayName = freshName();

      const { body } = await patchMine(donny.token, { displayName: `  ${displayName}  ` }).expect(
        200,
      );

      expect(body).toMatchObject({ userId: donny.userId, displayName });
    });

    it("409 DISPLAY_NAME_TAKEN for another member's name, in any casing", async () => {
      const { body } = await patchMine(donny.token, {
        displayName: walter.displayName.toUpperCase(),
      }).expect(409);

      expect(body).toEqual(DISPLAY_NAME_TAKEN);
    });

    // A member's own name does not count as taken, so they can change only
    // its casing. The new casing is what is stored.
    it("200 for the member's own name in another casing", async () => {
      const shouted = walter.displayName.toUpperCase();

      const { body } = await patchMine(walter.token, { displayName: shouted }).expect(200);

      expect((body as { displayName: string }).displayName).toBe(shouted);
      // Put it back, so the tests above find the name as they expect it.
      await patchMine(walter.token, { displayName: walter.displayName }).expect(200);
    });

    // The ownership rule answers before the unique constraint is ever
    // reached: the update matches no row, so nothing is written or refused.
    it("403, not 409, when a stranger sends a taken name to someone else's profile", async () => {
      const mine = await request(app.getHttpServer())
        .get("/profiles/me")
        .set(bearer(walter.token))
        .expect(200);
      const { id } = mine.body as { id: number };

      const { body } = await request(app.getHttpServer())
        .patch(`/profiles/${id}`)
        .set(bearer(donny.token))
        .send({ displayName: walter.displayName })
        .expect(403);

      expect(body).toMatchObject({ errorCode: "NOT_OWNER" });
    });
  });

  // A username is a login name. No other member may see it, so nothing an
  // anonymous caller or another member can read may carry one.
  describe("an abiding names its author by display name, never by username", () => {
    let maude: { sent: SignUpBody; token: string; userId: number; displayName: string };
    let abidingId: string;

    /** True when the username appears anywhere in the body, under any key. */
    function mentionsUsername(body: unknown): boolean {
      return JSON.stringify(body).includes(maude.sent.username);
    }

    beforeAll(async () => {
      const displayName = freshName();
      const { sent } = await signUp(app, { profile: { displayName } });
      maude = { sent, displayName, ...(await logIn(sent)) };
    });

    it("POST /abidings answers with the display name", async () => {
      const { body } = await request(app.getHttpServer())
        .post("/abidings")
        .set(bearer(maude.token))
        .send({ message: "the dude abides" })
        .expect(201);
      abidingId = (body as { id: string }).id;

      expect(body).toMatchObject({ userId: maude.userId, displayName: maude.displayName });
      expect(body).not.toHaveProperty("username");
      expect(mentionsUsername(body)).toBe(false);
    });

    it("GET /abidings/:id shows it to an anonymous caller, with no username", async () => {
      const { body } = await request(app.getHttpServer()).get(`/abidings/${abidingId}`).expect(200);

      expect(body).toMatchObject({ displayName: maude.displayName });
      expect(body).not.toHaveProperty("username");
      expect(mentionsUsername(body)).toBe(false);
    });

    it("GET /abidings shows it on every item, with no username", async () => {
      const { body } = await request(app.getHttpServer())
        .get(`/abidings?userId=${maude.userId}`)
        .expect(200);
      const { data } = body as { data: Record<string, unknown>[] };

      expect(data.length).toBeGreaterThan(0);
      for (const item of data) {
        expect(item).toMatchObject({ displayName: maude.displayName });
        expect(item).not.toHaveProperty("username");
      }
      expect(mentionsUsername(body)).toBe(false);
    });

    it("a profile read by another member carries no username either", async () => {
      const { body } = await request(app.getHttpServer())
        .get(`/profiles/user/${maude.userId}`)
        .set(bearer(walter.token))
        .expect(200);

      expect(body).toMatchObject({ displayName: maude.displayName });
      expect(body).not.toHaveProperty("username");
      expect(mentionsUsername(body)).toBe(false);
    });

    // The name is read from the profile on each request, not copied onto the
    // abiding, so an abiding written under the old name shows the new one.
    it("shows a new display name on an old abiding at once", async () => {
      const renamed = freshName();
      await request(app.getHttpServer())
        .patch("/profiles/me")
        .set(bearer(maude.token))
        .send({ displayName: renamed })
        .expect(200);

      const { body } = await request(app.getHttpServer()).get(`/abidings/${abidingId}`).expect(200);

      expect((body as { displayName: string }).displayName).toBe(renamed);
    });
  });

  describe("the old name fields are gone", () => {
    it("a profile carries displayName, and no firstName or lastName", async () => {
      const { body } = await request(app.getHttpServer())
        .get("/profiles/me")
        .set(bearer(walter.token))
        .expect(200);

      expect(body).toMatchObject({ displayName: walter.displayName });
      expect(body).not.toHaveProperty("firstName");
      expect(body).not.toHaveProperty("lastName");
    });

    it.each(["firstName", "lastName"])("PATCH /profiles/me refuses %s", async (field) => {
      await request(app.getHttpServer())
        .patch("/profiles/me")
        .set(bearer(walter.token))
        .send({ [field]: "Walter" })
        .expect(400);
    });
  });

  // A profile is edited through /profiles. It used to be accepted here and
  // ignored, which looked like success.
  it("PATCH /users/me refuses a profile", async () => {
    const { body } = await request(app.getHttpServer())
      .patch("/users/me")
      .set(bearer(walter.token))
      .send({ profile: { displayName: freshName() } })
      .expect(400);

    expect((body as { message: string[] }).message).toContain("property profile should not exist");
  });
});
