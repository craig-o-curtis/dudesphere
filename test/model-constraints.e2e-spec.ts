import { randomUUID } from "node:crypto";

import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types.js";

import { configureApp } from "./../src/app-setup.js";
import { AppModule } from "./../src/app.module.js";
import { listenOnLoopback } from "./listen-on-loopback.js";
import { signUp, signUpBody } from "./sign-up.js";

// Values a DTO used to accept and the database or the model then refused.
// Each one reached the caller as a 500, or was stored as something else.
// Every case here was first seen against the running app.
//
// Each rejection is checked two ways: the status is 400, and the body names
// the field. The second check matters. The exception filters also answer 400
// when the database refuses a value, with one fixed message that names no
// field. So a bare "expects 400" would still pass with the DTO rule removed.
// Naming the field proves the DTO did the work.
//
// Needs the databases running. Creates one throwaway user per run. Two rules
// keep the cleanup job in test/global-setup.ts working: no test changes that
// user's email, and no message here holds a #tag, which would register a
// real hashtag.
describe("Model constraints (e2e)", () => {
  let app: INestApplication<App>;
  let token: string;

  // One visible character, two code points: U+2764 and the variation selector
  // U+FE0F. The three ways of counting a string disagree about it, which is
  // what made it a bug.
  const RED_HEART = "❤️";
  // One visible letter, two code points.
  const LETTER_WITH_SELECTOR = "a️";

  function tag() {
    return randomUUID().replaceAll("-", "").slice(0, 8);
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Same global middleware, pipes and filters as main.ts. See src/app-setup.ts.
    configureApp(app);
    await listenOnLoopback(app);

    const { sent } = await signUp(app);
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ identifier: sent.email, password: sent.password })
      .expect(200);
    token = (login.body as { accessToken: string }).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  function patch(path: string, body: object) {
    return request(app.getHttpServer())
      .patch(path)
      .set("Authorization", `Bearer ${token}`)
      .send(body);
  }

  function post(path: string, body: object) {
    return request(app.getHttpServer())
      .post(path)
      .set("Authorization", `Bearer ${token}`)
      .send(body);
  }

  /** A 400 from the ValidationPipe whose list of problems names `field`. */
  function expectRejectedField(body: unknown, field: string) {
    expect(body).toMatchObject({
      statusCode: 400,
      error: "Bad Request",
      message: expect.arrayContaining([expect.stringContaining(field)]) as unknown,
    });
  }

  describe("null where the column is NOT NULL", () => {
    it.each(["username", "email"])("PATCH /users/me rejects null for %s", async (field) => {
      const { body } = await patch("/users/me", { [field]: null }).expect(400);

      expectRejectedField(body, field);
    });

    // This one never reached Postgres. It threw inside the password hasher.
    it("PATCH /users/me rejects null for password", async () => {
      const { body } = await patch("/users/me", {
        password: null,
        currentPassword: "secret123",
      }).expect(400);

      expectRejectedField(body, "password");
    });

    it("PATCH /users/me rejects null for currentPassword", async () => {
      const { body } = await patch("/users/me", {
        password: "secret456",
        currentPassword: null,
      }).expect(400);

      expectRejectedField(body, "currentPassword");
    });

    it("PATCH /profiles/me rejects null for isDude", async () => {
      const { body } = await patch("/profiles/me", { isDude: null }).expect(400);

      expectRejectedField(body, "isDude");
    });

    it("PATCH /profiles/me rejects null for displayName", async () => {
      const { body } = await patch("/profiles/me", { displayName: null }).expect(400);

      expectRejectedField(body, "displayName");
    });

    // The other side of the same rule: null is how a client clears a column
    // that allows it.
    it("PATCH /profiles/me still accepts null for a nullable column", async () => {
      await patch("/profiles/me", { bio: "The Dude abides" }).expect(200);

      const { body } = await patch("/profiles/me", { bio: null }).expect(200);

      expect((body as { bio: string | null }).bio).toBeNull();
    });
  });

  describe("a NUL character, which Postgres cannot store", () => {
    it.each(["bio", "displayName", "profileImageUrl"])(
      "PATCH /profiles/me rejects one in %s",
      async (field) => {
        const { body } = await patch("/profiles/me", { [field]: "ab\u0000cd" }).expect(400);

        expectRejectedField(body, field);
      },
    );

    it("POST /users rejects one in username", async () => {
      const { body } = await request(app.getHttpServer())
        .post("/auth/signup")
        .send(signUpBody({ username: `e2e\u0000${tag()}` }))
        .expect(400);

      expectRejectedField(body, "username");
    });
  });

  describe("a value longer than its column, counted the way Postgres counts", () => {
    // 13 letters to @MaxLength, 26 characters to the column's limit of 24.
    it("POST /auth/signup rejects a username that is only short if selectors are left out", async () => {
      const { body } = await request(app.getHttpServer())
        .post("/auth/signup")
        .send(signUpBody({ username: LETTER_WITH_SELECTOR.repeat(13) }))
        .expect(400);

      expectRejectedField(body, "username");
    });

    // 26 letters to @MaxLength, 52 characters to the column's limit of 50.
    it("PATCH /profiles/me rejects such a displayName", async () => {
      const { body } = await patch("/profiles/me", {
        displayName: LETTER_WITH_SELECTOR.repeat(26),
      }).expect(400);

      expectRejectedField(body, "displayName");
    });
  });

  describe("ordainedDate", () => {
    it("accepts an instant in UTC", async () => {
      await patch("/profiles/me", { ordainedDate: "2026-10-06T12:00:00Z" }).expect(200);
    });

    // The week date failed in Postgres as a 500. The others returned 200 and
    // were stored as a different day from the one sent: 30 February as
    // 2 March, and a year alone as 1 January.
    it.each(["2026-W12", "2026-02-30", "2026", "2026-10-06", "2026-02-30T00:00:00Z"])(
      "rejects %s",
      async (ordainedDate) => {
        const { body } = await patch("/profiles/me", { ordainedDate }).expect(400);

        expectRejectedField(body, "ordainedDate");
      },
    );

    it("rejects a bad date at sign-up too", async () => {
      const { body } = await request(app.getHttpServer())
        .post("/auth/signup")
        .send(signUpBody({ profile: { ordainedDate: "2026-02-30" } }))
        .expect(400);

      expectRejectedField(body, "ordainedDate");
    });
  });

  it("PATCH /profiles/me rejects a profileImageUrl that is not a url", async () => {
    const { body } = await patch("/profiles/me", { profileImageUrl: "my avatar" }).expect(400);

    expectRejectedField(body, "profileImageUrl");
  });

  // Mongo has no foreign keys and no column types, so nothing below the
  // service checks these. Each case here used to be accepted.
  describe("an abiding's image and the abiding it replies to", () => {
    type Abiding = {
      id: string;
      imageUrl: string | null;
      replyToId: string | null;
      updatedAt: string;
    };
    // Shaped like an abiding id, but no abiding has it.
    const MISSING_ID = "000000000000000000000000";
    let parent: Abiding;
    let reply: Abiding;

    // The DTO accepted imageUrl and the service dropped it.
    it("POST /abidings stores an image url and returns it", async () => {
      const { body } = await post("/abidings", {
        message: "with a picture",
        imageUrl: "https://example.com/rug.png",
      }).expect(201);

      parent = body as Abiding;
      expect(parent.imageUrl).toBe("https://example.com/rug.png");
      expect(parent.updatedAt).toEqual(expect.any(String));
    });

    it("GET /abidings/:id returns the image url too", async () => {
      const { body } = await request(app.getHttpServer()).get(`/abidings/${parent.id}`).expect(200);

      expect((body as Abiding).imageUrl).toBe("https://example.com/rug.png");
    });

    it("POST /abidings rejects a replyToId that is not an abiding id", async () => {
      const { body } = await post("/abidings", {
        message: "a reply to nothing",
        replyToId: "not-an-id",
      }).expect(400);

      expectRejectedField(body, "replyToId");
    });

    it("POST /abidings answers 404 for a reply to an abiding that is not there", async () => {
      const { body } = await post("/abidings", {
        message: "a reply to nothing",
        replyToId: MISSING_ID,
      }).expect(404);

      expect((body as { message: string }).message).toBe(
        "The abiding being replied to was not found",
      );
    });

    it("POST /abidings accepts a reply to a real abiding", async () => {
      const { body } = await post("/abidings", {
        message: "yeah, well",
        replyToId: parent.id,
      }).expect(201);

      reply = body as Abiding;
      expect(reply.replyToId).toBe(parent.id);
    });

    it("PATCH /abidings/:id rejects an abiding that replies to itself", async () => {
      await patch(`/abidings/${reply.id}`, { replyToId: reply.id }).expect(400);
    });

    // Null used to be dropped, so a reply could never become a plain abiding.
    it("PATCH /abidings/:id clears replyToId and imageUrl when sent null", async () => {
      const cleared = await patch(`/abidings/${reply.id}`, { replyToId: null }).expect(200);
      const noImage = await patch(`/abidings/${parent.id}`, { imageUrl: null }).expect(200);

      expect((cleared.body as Abiding).replyToId).toBeNull();
      expect((noImage.body as Abiding).imageUrl).toBeNull();
    });
  });

  // The DTO and the Mongoose schema each limit the message. They used to
  // count differently, so the schema refused what the DTO had accepted, and
  // an edit skipped the schema altogether.
  describe("an abiding's message length", () => {
    const atTheLimit = RED_HEART.repeat(280);
    const onePast = RED_HEART.repeat(281);
    let abidingId: string;

    it("POST /abidings accepts 280 red hearts", async () => {
      const { body } = await post("/abidings", { message: atTheLimit }).expect(201);

      const created = body as { id: string; message: string };
      expect(created.message).toBe(atTheLimit);
      abidingId = created.id;
    });

    it("POST /abidings rejects 281", async () => {
      const { body } = await post("/abidings", { message: onePast }).expect(400);

      expectRejectedField(body, "message");
    });

    it("PATCH /abidings/:id accepts 280", async () => {
      const { body } = await patch(`/abidings/${abidingId}`, { message: atTheLimit }).expect(200);

      expect((body as { message: string }).message).toBe(atTheLimit);
    });

    // Create refused this and edit stored it.
    it("PATCH /abidings/:id rejects 281, as create does", async () => {
      const { body } = await patch(`/abidings/${abidingId}`, { message: onePast }).expect(400);

      expectRejectedField(body, "message");
    });

    // This used to return 200 and change nothing.
    it("PATCH /abidings/:id rejects null for message", async () => {
      const { body } = await patch(`/abidings/${abidingId}`, { message: null }).expect(400);

      expectRejectedField(body, "message");
    });
  });
});
