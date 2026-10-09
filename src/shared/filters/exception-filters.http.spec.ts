import { Controller, Get, INestApplication, Logger } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types.js";
import { QueryFailedError } from "typeorm";

import { listenOnLoopback } from "../../../test/listen-on-loopback.js";
import { configureApp } from "../../app-setup.js";
import { UNIQUE_VIOLATION } from "./query-failed.filter.js";

// A controller that exists only to throw. Each route stands for one kind of
// error the filters have to sort out, so this file proves the filter order
// configureApp sets, and that a 500 body never carries the error's detail.
@Controller("boom")
class BoomController {
  @Get("plain")
  plain(): never {
    throw new Error("the secret detail");
  }

  @Get("unique")
  unique(): never {
    throw new QueryFailedError(
      "INSERT ...",
      [],
      Object.assign(new Error("dup"), { code: UNIQUE_VIOLATION }),
    );
  }
}

describe("Exception filters (over HTTP)", () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    // Every route here logs an error on purpose. Keep the test output clean.
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => {});

    const moduleFixture = await Test.createTestingModule({
      controllers: [BoomController],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await listenOnLoopback(app);
  });

  afterEach(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  it("answers a plain Error with a 500 that hides the message", async () => {
    const { body } = await request(app.getHttpServer()).get("/boom/plain").expect(500);

    expect(body).toEqual({ statusCode: 500, message: "Internal server error" });
  });

  it("still lets QueryFailedFilter turn a unique violation into a 409", async () => {
    const { body } = await request(app.getHttpServer()).get("/boom/unique").expect(409);

    expect(body.message).toBe("That value is already taken");
  });

  it("returns the request id header on an error response", async () => {
    const res = await request(app.getHttpServer())
      .get("/boom/plain")
      .set("x-request-id", "trace-42")
      .expect(500);

    expect(res.headers["x-request-id"]).toBe("trace-42");
  });
});
