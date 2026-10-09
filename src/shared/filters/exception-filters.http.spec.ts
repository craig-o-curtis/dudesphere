// WHAT THIS FILE IS
//
// An HTTP spec. It starts a tiny Nest app with one throwaway controller,
// then sends real HTTP requests to it with supertest.
//
// Why not a plain unit spec? Exception filters only run when Nest handles a
// real request. Each filter has its own unit spec for its logic; this file
// proves the whole chain: the filter order configureApp sets, the body a
// caller sees, and the request id header on an error response.
//
// Why not an e2e test? The controller here fakes each error, so no database
// is needed, and it runs with the fast unit suite (pnpm test).

import { inspect } from "node:util";

import { Controller, Get, INestApplication, Logger } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { mongo } from "mongoose";
import request from "supertest";
import type { App } from "supertest/types.js";
import { QueryFailedError } from "typeorm";
import type { MockInstance } from "vitest";

import { listenOnLoopback } from "../../../test/listen-on-loopback.js";
import { configureApp } from "../../app-setup.js";
import { DUPLICATE_KEY } from "./mongo-error.filter.js";
import { UNIQUE_VIOLATION } from "./query-failed.filter.js";

const PASSWORD_HASH = "$2b$10$hash-that-must-never-be-logged";

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

  // A failed insert that is not a conflict: 22001 is "value too long". The
  // parameters stand for what a real user insert would carry.
  @Get("query")
  query(): never {
    throw new QueryFailedError(
      'INSERT INTO "user" ...',
      ["walter@example.com", PASSWORD_HASH],
      Object.assign(new Error("value too long for type character varying(96)"), { code: "22001" }),
    );
  }

  @Get("mongo-dup")
  mongoDup(): never {
    throw new mongo.MongoServerError({ message: "E11000", code: DUPLICATE_KEY });
  }

  @Get("mongo-down")
  mongoDown(): never {
    throw new mongo.MongoNetworkError("socket closed");
  }
}

describe("Exception filters (over HTTP)", () => {
  let app: INestApplication<App>;
  let logError: MockInstance<Logger["error"]>;

  beforeEach(async () => {
    // Every route here logs an error on purpose. Keep the test output clean.
    logError = vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
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

  // The body above is the same with or without the catch-all, so the log line
  // is the only proof that configureApp registers it.
  it("logs the route, user and request id of a plain Error", async () => {
    await request(app.getHttpServer())
      .get("/boom/plain")
      .set("x-request-id", "trace-42")
      .expect(500);

    expect(logError).toHaveBeenCalledWith(
      "GET /boom/plain failed for user anonymous (request trace-42): the secret detail",
      undefined,
    );
  });

  it("answers any other Postgres error with the same plain 500", async () => {
    const { body } = await request(app.getHttpServer()).get("/boom/query").expect(500);

    expect(body).toEqual({ statusCode: 500, message: "Internal server error" });
  });

  // A QueryFailedError carries the values its query ran with. Logged whole,
  // a failed user insert would put the password hash in the log.
  it("logs a Postgres fault without the query's parameters", async () => {
    await request(app.getHttpServer()).get("/boom/query").expect(500);

    const logged = inspect(logError.mock.calls, { depth: null });
    expect(logged).toContain("GET /boom/query failed for user anonymous");
    expect(logged).toContain("value too long for type character varying(96)");
    expect(logged).not.toContain(PASSWORD_HASH);
    expect(logged).not.toContain("walter@example.com");
  });

  it("still lets QueryFailedFilter turn a unique violation into a 409", async () => {
    const { body } = await request(app.getHttpServer()).get("/boom/unique").expect(409);

    expect(body.message).toBe("That value is already taken");
  });

  it("puts the errorCode in the 409 body", async () => {
    const { body } = await request(app.getHttpServer()).get("/boom/unique").expect(409);

    expect(body).toEqual({
      statusCode: 409,
      message: "That value is already taken",
      error: "Conflict",
      errorCode: "VALUE_TAKEN",
    });
  });

  it("turns a Mongo duplicate key into a 409", async () => {
    const { body } = await request(app.getHttpServer()).get("/boom/mongo-dup").expect(409);

    expect(body.errorCode).toBe("VALUE_TAKEN");
  });

  it("turns a lost Mongo connection into a 503", async () => {
    const { body } = await request(app.getHttpServer()).get("/boom/mongo-down").expect(503);

    expect(body.message).toBe("Database unavailable");
    expect(body.errorCode).toBe("DATABASE_UNAVAILABLE");
  });

  it("returns the request id header on an error response", async () => {
    const res = await request(app.getHttpServer())
      .get("/boom/plain")
      .set("x-request-id", "trace-42")
      .expect(500);

    expect(res.headers["x-request-id"]).toBe("trace-42");
  });
});
