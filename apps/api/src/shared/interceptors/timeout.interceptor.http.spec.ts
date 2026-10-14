// WHAT THIS FILE IS
//
// An HTTP spec. It starts a tiny Nest app with one throwaway controller,
// then sends real HTTP requests to it with supertest.
//
// Why not a plain unit spec? The unit spec next to this file tests the
// interceptor alone. Only a real request can prove that configureApp
// registers it, and that the 408 reaches the caller with the usual body.
//
// Why not an e2e test? The controller here is slow on purpose, so no database
// is needed, and it runs with the fast unit suite (pnpm test).

import { Controller, Get, INestApplication, Logger } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types.js";

import { listenOnLoopback } from "../../../test/listen-on-loopback.js";
import { configureApp } from "../../app-setup.js";

const LIMIT_MS = 40;

@Controller("pace")
class PaceController {
  @Get("fast")
  fast(): { ok: boolean } {
    return { ok: true };
  }

  // Five times the limit: long enough to be cut off, short enough that the
  // handler has finished before the app closes.
  @Get("slow")
  async slow(): Promise<{ ok: boolean }> {
    await new Promise((resolve) => setTimeout(resolve, LIMIT_MS * 5));
    return { ok: true };
  }
}

describe("TimeoutInterceptor (over HTTP)", () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    // The slow route logs a warning on purpose. Keep the test output clean.
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => {});

    const moduleFixture = await Test.createTestingModule({
      controllers: [PaceController],
    }).compile();
    app = moduleFixture.createNestApplication();
    // The production setup, with only the limit shortened.
    configureApp(app, { requestTimeoutMs: LIMIT_MS });
    await listenOnLoopback(app);
  });

  afterEach(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  it("answers a handler that finishes in time as usual", async () => {
    const { body } = await request(app.getHttpServer()).get("/pace/fast").expect(200);

    expect(body).toEqual({ ok: true });
  });

  it("answers a handler that takes too long with a 408", async () => {
    const res = await request(app.getHttpServer())
      .get("/pace/slow")
      .set("x-request-id", "trace-42")
      .expect(408);

    expect(res.body).toEqual({ statusCode: 408, message: "Request Timeout" });
    expect(res.headers["x-request-id"]).toBe("trace-42");
  });
});
