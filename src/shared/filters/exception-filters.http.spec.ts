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
import { Error as MongooseError, mongo } from "mongoose";
import request from "supertest";
import type { App } from "supertest/types.js";
import { QueryFailedError } from "typeorm";
import type { MockInstance } from "vitest";

import { listenOnLoopback } from "../../../test/listen-on-loopback.js";
import { configureApp } from "../../app-setup.js";
import { DUPLICATE_KEY } from "./mongo-error.filter.js";
import { UNIQUE_VIOLATION } from "./query-failed.filter.js";

const PASSWORD_HASH = "$2b$10$hash-that-must-never-be-logged";
const FOREIGN_KEY_MESSAGE =
  'insert or update on table "profile" violates foreign key constraint "FK_profile_userId"';

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

  // A failed insert that is a real fault: 23503 is a foreign key violation,
  // which no caller input can cause here. The parameters stand for what a
  // real user insert would carry.
  @Get("query")
  query(): never {
    throw new QueryFailedError(
      'INSERT INTO "user" ...',
      ["walter@example.com", PASSWORD_HASH],
      Object.assign(new Error(FOREIGN_KEY_MESSAGE), { code: "23503" }),
    );
  }

  // A value the column cannot hold, which a DTO should have stopped: 22001 is
  // "value too long".
  @Get("bad-value")
  badValue(): never {
    throw new QueryFailedError(
      'UPDATE "profile" ...',
      ["a first name that is far too long"],
      Object.assign(new Error("value too long for type character varying(100)"), { code: "22001" }),
    );
  }

  // What pg throws when Postgres cannot be reached: a plain Error with a
  // socket code, not a QueryFailedError.
  @Get("pg-down")
  pgDown(): never {
    throw Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), {
      code: "ECONNREFUSED",
    });
  }

  // What TypeORM throws when the connection drops while a query runs.
  @Get("pg-dropped")
  pgDropped(): never {
    throw new QueryFailedError("SELECT ...", [], new Error("Connection terminated unexpectedly"));
  }

  // What Mongoose raises when a value breaks a rule in a schema, which a DTO
  // should have stopped first.
  @Get("mongoose-invalid")
  mongooseInvalid(): never {
    const error = new MongooseError.ValidationError();
    error.addError(
      "message",
      new MongooseError.ValidatorError({
        path: "message",
        message: "Message cannot exceed 280 characters",
      }),
    );
    throw error;
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
  let logWarn: MockInstance<Logger["warn"]>;

  beforeEach(async () => {
    // Every route here logs an error on purpose. Keep the test output clean.
    logError = vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
    logWarn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => {});

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
    expect(logged).toContain(FOREIGN_KEY_MESSAGE);
    expect(logged).not.toContain(PASSWORD_HASH);
    expect(logged).not.toContain("walter@example.com");
  });

  // The safety net for a value a DTO let through. The body is fixed, so it
  // cannot quote the value, and it is a 400 because the caller sent it.
  it("answers a value Postgres refused with a 400 that hides the driver message", async () => {
    const { body } = await request(app.getHttpServer()).get("/boom/bad-value").expect(400);

    expect(body).toEqual({
      statusCode: 400,
      message: "A value in the request is not valid",
      error: "Bad Request",
    });
  });

  // A hit on the net means a DTO rule is missing. The warning is how someone
  // finds out which route needs it.
  it("logs a warning for that 400, naming the route and the request id", async () => {
    await request(app.getHttpServer())
      .get("/boom/bad-value")
      .set("x-request-id", "trace-42")
      .expect(400);

    expect(logWarn).toHaveBeenCalledWith(
      "GET /boom/bad-value for user anonymous (request trace-42): Postgres refused a value " +
        "a DTO should have stopped (22001): value too long for type character varying(100)",
    );
    expect(logError).not.toHaveBeenCalled();
  });

  it("answers a value Mongoose refused with the same 400", async () => {
    const { body } = await request(app.getHttpServer()).get("/boom/mongoose-invalid").expect(400);

    expect(body).toEqual({
      statusCode: 400,
      message: "A value in the request is not valid",
      error: "Bad Request",
    });
    expect(logWarn).toHaveBeenCalledWith(
      expect.stringContaining("GET /boom/mongoose-invalid for user anonymous"),
    );
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

  // The same body whichever database is down, so a client needs one branch.
  it.each(["/boom/pg-down", "/boom/pg-dropped", "/boom/mongo-down"])(
    "answers %s with the 503 for a database that cannot be reached",
    async (route) => {
      const { body } = await request(app.getHttpServer()).get(route).expect(503);

      expect(body).toEqual({
        statusCode: 503,
        message: "Database unavailable",
        error: "Service Unavailable",
        errorCode: "DATABASE_UNAVAILABLE",
      });
    },
  );

  it("returns the request id header on an error response", async () => {
    const res = await request(app.getHttpServer())
      .get("/boom/plain")
      .set("x-request-id", "trace-42")
      .expect(500);

    expect(res.headers["x-request-id"]).toBe("trace-42");
  });
});
