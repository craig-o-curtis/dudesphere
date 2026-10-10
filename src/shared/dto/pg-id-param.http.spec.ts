// WHAT THIS FILE IS
//
// An HTTP spec. It starts a tiny Nest app with one controller and a fake
// service, then sends real HTTP requests to it with supertest.
//
// Why not a plain unit spec? Calling controller.getUserById(...) directly
// skips the ValidationPipe, so a unit test could never prove that a bad id
// gets a 400. Only a real request runs the pipeline. This file calls the
// same configureApp() as main.ts, so the pipeline is the production one.
//
// Why not an e2e test? The service is a mock, so no database is needed, and
// it runs with the fast unit suite (pnpm test), not with pnpm test:e2e.

import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types.js";

import { listenOnLoopback } from "../../../test/listen-on-loopback.js";
import { configureApp } from "../../app-setup.js";
import { UsersController } from "../../users/users.controller.js";
import { UsersService } from "../../users/users.service.js";
import { PaginationProvider } from "../pagination/pagination.provider.js";
import { PG_INT_MAX } from "./pg-id-param.dto.js";

// PgIdParamDto is enforced by the global ValidationPipe, which only runs in the
// real request pipeline — calling controller.getUserById({ id: 1 }) directly
// skips it entirely. So this boots an HTTP app, configured by the same
// configureApp() main.ts calls, with mocked services so no database is needed.
//
// UsersController stands in for every route using PgIdParamDto; ProfilesController
// shares the DTO and needs no second copy of these cases.
describe("PgIdParamDto (over HTTP)", () => {
  let app: INestApplication<App>;

  const usersService = {
    getUserById: vi.fn(),
    getUsers: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    usersService.getUserById.mockResolvedValue({ id: 1, username: "walter" });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: usersService },
        // The real one: it has no dependencies, and it builds the links these tests read.
        PaginationProvider,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    // No APP_GUARD in this module, so nothing populates request.user and
    // @CurrentUser() would hand /users/me undefined. JwtAuthGuard has its own
    // tests; the id param is what this file is about.
    app.use((req: { user?: unknown }, _res: unknown, next: () => void) => {
      req.user = { userId: 7, username: "walter", role: "user" };
      next();
    });
    // The same global setup as main.ts, so the ValidationPipe options here
    // cannot drift from the ones production runs with.
    configureApp(app);
    await listenOnLoopback(app);
  });

  afterEach(async () => {
    await app.close();
  });

  it("passes a normal id through, coerced to a number", async () => {
    await request(app.getHttpServer()).get("/users/42").expect(200);

    expect(usersService.getUserById).toHaveBeenCalledWith(42);
    expect(typeof usersService.getUserById.mock.calls[0][0]).toBe("number");
  });

  it("accepts the largest value a Postgres integer holds", async () => {
    await request(app.getHttpServer()).get(`/users/${PG_INT_MAX}`).expect(200);

    expect(usersService.getUserById).toHaveBeenCalledWith(PG_INT_MAX);
  });

  // The bug this DTO exists for. ParseIntPipe accepted 20 digits, parseInt
  // returned 1e20, and Postgres answered numeric_value_out_of_range, which
  // PgErrorFilter does not convert — so the caller got a 500.
  it("rejects an id past the Postgres integer limit with 400, not 500", async () => {
    await request(app.getHttpServer()).get("/users/99999999999999999999").expect(400);

    expect(usersService.getUserById).not.toHaveBeenCalled();
  });

  it("rejects one past the limit by a single digit", async () => {
    await request(app.getHttpServer())
      .get(`/users/${PG_INT_MAX + 1}`)
      .expect(400);

    expect(usersService.getUserById).not.toHaveBeenCalled();
  });

  // Digits only. Each of these coerces to a perfectly valid integer under a
  // plain @Type(() => Number), which would let one row answer to several URLs.
  it.each(["1e5", "0x10", "+5", "1.0"])("rejects the alternative spelling %j", async (id) => {
    await request(app.getHttpServer())
      .get(`/users/${encodeURIComponent(id)}`)
      .expect(400);

    expect(usersService.getUserById).not.toHaveBeenCalled();
  });

  it.each(["abc", "1.5", "-1", "0", "%20", "null"])("rejects %j", async (id) => {
    await request(app.getHttpServer()).get(`/users/${id}`).expect(400);

    expect(usersService.getUserById).not.toHaveBeenCalled();
  });

  // "me" has its own route, declared before @Get(":id"). This checks the
  // ordering holds: without it the DTO would reject "me" as a bad id, so a 400
  // here would mean the routes had been reordered.
  it("does not send GET /users/me through the id route", async () => {
    await request(app.getHttpServer()).get("/users/me").expect(200);

    // 7 is the id on the stand-in request user, not anything from the URL.
    expect(usersService.getUserById).toHaveBeenCalledWith(7);
  });
});
