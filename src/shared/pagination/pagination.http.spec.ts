// WHAT THIS FILE IS
//
// An HTTP spec. It starts a tiny Nest app with two controllers and fake
// services, then sends real HTTP requests to it with supertest.
//
// Why not a plain unit spec? ClassSerializerInterceptor only runs on a real
// request. It is what keeps `password` out of a response, and a list now puts
// its items one level down, inside `data`. Only a real request proves the
// interceptor still reaches them there. This file calls the same
// configureApp() as main.ts, so the pipeline is the production one.
//
// Why not an e2e test? The services are mocks, so no database is needed, and
// it runs with the fast unit suite (pnpm test), not with pnpm test:e2e.

import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types.js";

import { listenOnLoopback } from "../../../test/listen-on-loopback.js";
import { AbidingsController } from "../../abidings/abidings.controller.js";
import { AbidingsService } from "../../abidings/abidings.service.js";
import { AbidingResponseDto } from "../../abidings/dto/abiding-response.dto.js";
import { configureApp } from "../../app-setup.js";
import { UserResponseDto } from "../../users/dto/user-response.dto.js";
import { UserRole } from "../../users/user.entity.js";
import { UsersController } from "../../users/users.controller.js";
import { UsersService } from "../../users/users.service.js";
import type { Paginated } from "./paginated.interface.js";
import { PaginationProvider } from "./pagination.provider.js";

// No APP_GUARD is registered, because AppModule is not imported, so the
// admin-only GET /users is reachable without a token.
describe("a paginated response (over HTTP)", () => {
  let app: INestApplication<App>;

  const usersService = { getUsers: vi.fn() };
  const abidingsService = { getAbidings: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [UsersController, AbidingsController],
      providers: [
        { provide: UsersService, useValue: usersService },
        { provide: AbidingsService, useValue: abidingsService },
        // The real one: it is the thing under test here.
        PaginationProvider,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await listenOnLoopback(app);
  });

  afterEach(async () => {
    await app.close();
  });

  // UsersService.toResponseDto never copies the password, so this test sets
  // one itself. It is the serializer under test, not the service.
  it("keeps @Exclude fields out of the items inside data", async () => {
    usersService.getUsers.mockResolvedValue({
      items: [
        new UserResponseDto({
          id: 1,
          username: "walter",
          email: "walter@example.com",
          role: UserRole.USER,
          password: "hashed(secret)",
          deletedAt: "2026-10-06T00:00:00.000Z",
        }),
      ],
      total: 1,
    });

    const response = await request(app.getHttpServer()).get("/users").expect(200);
    const body = response.body as Paginated<Record<string, unknown>>;

    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ id: 1, username: "walter" });
    expect(body.data[0]).not.toHaveProperty("password");
    expect(body.data[0]).not.toHaveProperty("deletedAt");
  });

  // AbidingResponseDto turns a missing replyToId into null with @Transform.
  // That only happens if the item is still a class instance when it is
  // serialized. The service returns instances, and the controller and
  // PaginationProvider.toResponse must pass them on without copying them.
  it("applies @Transform to the items inside data", async () => {
    abidingsService.getAbidings.mockResolvedValue({
      items: [
        new AbidingResponseDto({ id: "a1", userId: 1, message: "hello", username: "walter" }),
      ],
      total: 1,
    });

    const response = await request(app.getHttpServer()).get("/abidings").expect(200);
    const body = response.body as Paginated<Record<string, unknown>>;

    expect(body.data[0]).toMatchObject({
      id: "a1",
      username: "walter",
      replyToId: null,
      hashtags: [],
    });
  });

  it("sends the whole envelope, with a null link kept as null", async () => {
    usersService.getUsers.mockResolvedValue({ items: [], total: 0 });

    const response = await request(app.getHttpServer()).get("/users").expect(200);

    // toEqual on the whole body: `next` and `previous` have to be present as
    // null, not dropped, so a client can test them without checking for the key.
    expect(response.body).toEqual({
      data: [],
      meta: { itemsPerPage: 10, totalItems: 0, currentPage: 1, totalPages: 0 },
      links: {
        first: "/users?limit=10&page=1",
        last: "/users?limit=10&page=1",
        current: "/users?limit=10&page=1",
        next: null,
        previous: null,
      },
    });
  });

  it("writes the page the caller asked for into meta and links", async () => {
    usersService.getUsers.mockResolvedValue({ items: [], total: 12 });

    const response = await request(app.getHttpServer()).get("/users?limit=5&page=2").expect(200);
    const body = response.body as Paginated<unknown>;

    expect(body.meta).toEqual({ itemsPerPage: 5, totalItems: 12, currentPage: 2, totalPages: 3 });
    expect(body.links.next).toBe("/users?limit=5&page=3");
    expect(body.links.previous).toBe("/users?limit=5&page=1");
  });
});
