// WHAT THIS FILE IS
//
// An HTTP spec. It starts a tiny Nest app with one controller and fake
// services, then sends real HTTP requests to it with supertest.
//
// Why not a plain unit spec? Calling a controller method directly skips the
// pipes, so a unit test could never prove that ParseObjectIdPipe rejects a
// bad :id with a 400. Only a real request runs the pipeline.
//
// Why not an e2e test? The services are mocks, so no database is needed, and
// it runs with the fast unit suite (pnpm test), not with pnpm test:e2e.

import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types.js";

import { listenOnLoopback } from "../../test/listen-on-loopback.js";
import { configureApp } from "../app-setup.js";
import { UsersService } from "../users/users.service.js";
import { AbidingsController } from "./abidings.controller.js";
import { AbidingsService } from "./abidings.service.js";

// Pipes do not run when a controller method is called directly, so
// abidings.controller.spec.ts cannot prove that ParseObjectIdPipe is bound to
// the :id routes — a test there asserting a 400 would pass without the pipe
// existing at all. This file boots a real HTTP app so the pipe runs.
//
// Services are mocked, so this needs no Postgres and no Mongo and belongs with
// the unit suite rather than test/*.e2e-spec.ts. No APP_GUARD is registered
// either, because AppModule is not imported, so the routes are reachable
// without a token and the ids are the only thing under test.
describe("AbidingsController id params (over HTTP)", () => {
  let app: INestApplication<App>;

  const abidingService = {
    getAbidings: vi.fn(),
    getAbidingsByHashtags: vi.fn(),
    getAbidingById: vi.fn(),
    getAbidingsByUserId: vi.fn(),
    patchAbiding: vi.fn(),
    deleteAbiding: vi.fn(),
  };

  const usersService = { getUsersByIds: vi.fn() };

  const VALID_ID = "6ac543e3d91134719299fe49";

  beforeEach(async () => {
    vi.resetAllMocks();
    usersService.getUsersByIds.mockResolvedValue([{ id: 1, username: "walter" }]);
    abidingService.getAbidingById.mockResolvedValue({ id: VALID_ID, userId: 1, message: "hi" });
    abidingService.patchAbiding.mockResolvedValue({ id: VALID_ID, userId: 1, message: "edited" });
    abidingService.deleteAbiding.mockResolvedValue(undefined);
    abidingService.getAbidingsByUserId.mockResolvedValue({ items: [], total: 0 });
    abidingService.getAbidings.mockResolvedValue({ items: [], total: 0 });
    abidingService.getAbidingsByHashtags.mockResolvedValue({ items: [], total: 0 });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AbidingsController],
      providers: [
        { provide: AbidingsService, useValue: abidingService },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    // The same pipeline as main.ts. GET /abidings/me takes a PaginationQueryDto,
    // and its limit and page only get their defaults from the ValidationPipe.
    configureApp(app);
    // No APP_GUARD here, so nothing populates request.user and @CurrentUser()
    // would hand the handlers undefined. This stands in for JwtAuthGuard, which
    // has its own tests — the ids are what this file is about.
    app.use((req: { user?: unknown }, _res: unknown, next: () => void) => {
      req.user = { userId: 1, username: "walter", role: "user" };
      next();
    });
    await listenOnLoopback(app);
  });

  afterEach(async () => {
    await app.close();
  });

  // Before the pipe, a junk id reached findOne({ _id: id }), Mongoose threw a
  // CastError, and QueryFailedFilter did not catch it because it only handles
  // TypeORM errors — so the caller got a 500.
  describe("rejects a malformed id with 400, not 500", () => {
    it.each(["not-an-id", "123", "hello world!", "6ac543e3d91134719299fe4"])(
      "GET /abidings/%s",
      async (id) => {
        await request(app.getHttpServer())
          .get(`/abidings/${encodeURIComponent(id)}`)
          .expect(400);

        expect(abidingService.getAbidingById).not.toHaveBeenCalled();
      },
    );

    it("PATCH /abidings/:id", async () => {
      await request(app.getHttpServer())
        .patch("/abidings/not-an-id")
        .send({ message: "edited" })
        .expect(400);

      expect(abidingService.patchAbiding).not.toHaveBeenCalled();
    });

    it("DELETE /abidings/:id", async () => {
      await request(app.getHttpServer()).delete("/abidings/not-an-id").expect(400);

      expect(abidingService.deleteAbiding).not.toHaveBeenCalled();
    });
  });

  describe("lets a well-formed id through", () => {
    // Also pins the conversion: the pipe hands the controller a
    // Types.ObjectId, and the service is typed for a string.
    it("GET passes the id to the service as a string", async () => {
      await request(app.getHttpServer()).get(`/abidings/${VALID_ID}`).expect(200);

      expect(abidingService.getAbidingById).toHaveBeenCalledWith(VALID_ID);
      expect(typeof abidingService.getAbidingById.mock.calls[0][0]).toBe("string");
    });

    it("PATCH passes the id to the service as a string", async () => {
      await request(app.getHttpServer())
        .patch(`/abidings/${VALID_ID}`)
        .send({ message: "edited" })
        .expect(200);

      expect(abidingService.patchAbiding.mock.calls[0][0]).toBe(VALID_ID);
      expect(typeof abidingService.patchAbiding.mock.calls[0][0]).toBe("string");
    });

    it("DELETE passes the id to the service as a string", async () => {
      await request(app.getHttpServer()).delete(`/abidings/${VALID_ID}`).expect(204);

      expect(abidingService.deleteAbiding.mock.calls[0][0]).toBe(VALID_ID);
      expect(typeof abidingService.deleteAbiding.mock.calls[0][0]).toBe("string");
    });

    // An upper-case id is valid and normalizes on the way through, so the
    // service never has to care about casing.
    it("normalizes upper-case hex to lower case", async () => {
      await request(app.getHttpServer()).get(`/abidings/${VALID_ID.toUpperCase()}`).expect(200);

      expect(abidingService.getAbidingById).toHaveBeenCalledWith(VALID_ID);
    });
  });

  // "me" has its own route, declared before @Get(":id"). This checks the
  // ordering still holds: it must reach getAbidingsByUserId, not the pipe.
  // Without the ordering, the pipe would reject "me" as a malformed id.
  it("does not send GET /abidings/me through the id route", async () => {
    await request(app.getHttpServer()).get("/abidings/me").expect(200);

    expect(abidingService.getAbidingsByUserId).toHaveBeenCalledWith(1, { limit: 10, page: 1 });
    expect(abidingService.getAbidingById).not.toHaveBeenCalled();
  });

  it("passes ?limit and ?page on GET /abidings/me through as numbers", async () => {
    await request(app.getHttpServer()).get("/abidings/me?limit=5&page=2").expect(200);

    expect(abidingService.getAbidingsByUserId).toHaveBeenCalledWith(1, { limit: 5, page: 2 });
  });

  // ListAbidingsQueryDto extends PaginationQueryDto. This checks the
  // inherited fields keep their defaults, their conversion and their bounds
  // next to the route's own filter.
  describe("GET /abidings takes limit and page alongside its filters", () => {
    it("defaults to limit 10 and page 1", async () => {
      await request(app.getHttpServer()).get("/abidings?userId=3").expect(200);

      expect(abidingService.getAbidings).toHaveBeenCalledWith({ limit: 10, page: 1 }, 3);
    });

    it("passes a limit and page through as numbers", async () => {
      await request(app.getHttpServer()).get("/abidings?userId=3&limit=5&page=2").expect(200);

      expect(abidingService.getAbidings).toHaveBeenCalledWith({ limit: 5, page: 2 }, 3);
    });

    // Number() reads each of these as a number. %2B is an encoded "+".
    it.each(["userId=0x10", "userId=1e1", "userId=%2B5", "userId=abc"])(
      "rejects ?%s with 400",
      async (query) => {
        await request(app.getHttpServer()).get(`/abidings?${query}`).expect(400);

        expect(abidingService.getAbidings).not.toHaveBeenCalled();
      },
    );

    it.each(["limit=101", "limit=0", "page=0", "limit=abc"])(
      "rejects ?%s with 400",
      async (query) => {
        await request(app.getHttpServer()).get(`/abidings?${query}`).expect(400);

        expect(abidingService.getAbidings).not.toHaveBeenCalled();
      },
    );
  });

  // Mongo merges sorted index runs for up to 200 tags and sorts in memory
  // past that. The limit is 10, the most one abiding can carry.
  describe("GET /abidings limits how many tags one request may filter by", () => {
    function tags(count: number) {
      return Array.from({ length: count }, (_, i) => `tag${i}`).join(",");
    }

    it("accepts 10 tags", async () => {
      await request(app.getHttpServer())
        .get(`/abidings?hashtag=${tags(10)}`)
        .expect(200);

      expect(abidingService.getAbidingsByHashtags.mock.calls[0][0]).toHaveLength(10);
    });

    it("rejects 11 tags with 400", async () => {
      await request(app.getHttpServer())
        .get(`/abidings?hashtag=${tags(11)}`)
        .expect(400);

      expect(abidingService.getAbidingsByHashtags).not.toHaveBeenCalled();
    });

    // Empty parts are dropped before the tags are counted.
    it("does not count empty parts towards the limit", async () => {
      await request(app.getHttpServer())
        .get(`/abidings?hashtag=${tags(10)},,,`)
        .expect(200);
    });
  });

  it("rejects a bad page on GET /abidings/me with 400", async () => {
    await request(app.getHttpServer()).get("/abidings/me?page=0").expect(400);

    expect(abidingService.getAbidingsByUserId).not.toHaveBeenCalled();
  });
});
