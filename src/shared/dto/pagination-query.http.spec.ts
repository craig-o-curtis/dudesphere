// WHAT THIS FILE IS
//
// An HTTP spec. It starts a tiny Nest app with one controller and a fake
// service, then sends real HTTP requests to it with supertest.
//
// Why not a plain unit spec? Calling controller.getProfiles(...) directly
// skips the ValidationPipe, so a unit test could never prove that ?page=0
// is rejected. Only a real request runs the pipeline. This file calls the
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
import { ProfilesController } from "../../profiles/profiles.controller.js";
import { ProfilesService } from "../../profiles/profiles.service.js";
import { PaginationProvider } from "../../shared/pagination/pagination.provider.js";

// PaginationQueryDto runs inside the global ValidationPipe, which only exists
// on a real request. ProfilesController stands in for both list routes.
describe("PaginationQueryDto (over HTTP)", () => {
  let app: INestApplication<App>;

  const profilesService = { getProfiles: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    profilesService.getProfiles.mockResolvedValue({ items: [], total: 0 });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ProfilesController],
      providers: [
        { provide: ProfilesService, useValue: profilesService },
        // The real one: it has no dependencies, and it builds the links these tests read.
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

  it("defaults to limit 10 and page 1", async () => {
    await request(app.getHttpServer()).get("/profiles").expect(200);

    expect(profilesService.getProfiles).toHaveBeenCalledWith({ limit: 10, page: 1 });
  });

  it("passes a limit and page through as numbers", async () => {
    await request(app.getHttpServer()).get("/profiles?limit=5&page=2").expect(200);

    expect(profilesService.getProfiles).toHaveBeenCalledWith({ limit: 5, page: 2 });
  });

  it("accepts the largest limit", async () => {
    await request(app.getHttpServer()).get("/profiles?limit=100").expect(200);

    expect(profilesService.getProfiles).toHaveBeenCalledWith({ limit: 100, page: 1 });
  });

  // The bug: page 0 became OFFSET -10, which Postgres rejects, so the caller
  // got a 500 for a bad query string. A page of twenty 9s did the same from
  // the other end: its OFFSET does not fit a Postgres bigint.
  //
  // From limit=0x10 on, the value is one Number() would read but that is not
  // plain digits, an empty value, or a param sent twice.
  it.each([
    "page=0",
    "page=-1",
    "page=1000001",
    "page=99999999999999999999",
    "limit=0",
    "limit=101",
    "limit=abc",
    "page=1.5",
    "limit=0x10",
    "limit=1e1",
    "limit=%2B5",
    "limit=",
    "page=",
    "page=1&page=2",
    "sort=name",
  ])("rejects ?%s with 400, not 500", async (query) => {
    await request(app.getHttpServer()).get(`/profiles?${query}`).expect(400);

    expect(profilesService.getProfiles).not.toHaveBeenCalled();
  });
});
