import { INestApplication } from "@nestjs/common";
import { getConnectionToken } from "@nestjs/mongoose";
import { Test, TestingModule } from "@nestjs/testing";
import type { Connection } from "mongoose";
import { mongo } from "mongoose";
import type { App } from "supertest/types.js";
import { DataSource, QueryFailedError } from "typeorm";

import { configureApp } from "./../src/app-setup.js";
import { AppModule } from "./../src/app.module.js";
import { MAX_TIME_EXPIRED } from "./../src/shared/filters/mongo-error.filter.js";
import { QUERY_CANCELED } from "./../src/shared/filters/pg-error.filter.js";
import { REQUEST_TIMEOUT_MS } from "./../src/shared/interceptors/timeout.interceptor.js";
import { listenOnLoopback } from "./listen-on-loopback.js";

// A request has a time limit, and so does each query it runs. Without the
// second, a stuck query kept its database connection for good, even after the
// caller had been answered.
//
// The first two tests check that the limits set in src/app.module.ts reached
// the databases. The last two check what a database does at its limit, using
// a much shorter one, so the suite does not have to wait ten seconds. The
// error each one throws is what the exception filters turn into a 408; their
// own specs cover that step.
//
// Needs the databases running. Reads only: it writes no rows.
describe("Query time limits (e2e)", () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let connection: Connection;

  const SHORT_LIMIT_MS = 200;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await listenOnLoopback(app);

    dataSource = app.get(DataSource);
    connection = app.get<Connection>(getConnectionToken());
  });

  afterAll(async () => {
    await app.close();
  });

  it("gives every Postgres statement the request's time limit", async () => {
    const [row] = (await dataSource.query("SHOW statement_timeout")) as [
      { statement_timeout: string },
    ];

    // Postgres prints a whole number of seconds this way.
    expect(row.statement_timeout).toBe(`${REQUEST_TIMEOUT_MS / 1000}s`);
  });

  it("gives every Mongo operation the request's time limit", () => {
    expect(connection.getClient().options.timeoutMS).toBe(REQUEST_TIMEOUT_MS);
  });

  it("Postgres cancels a statement at its limit and the connection stays usable", async () => {
    // One connection, so the shorter limit set here applies to the next query
    // and to nothing else.
    const runner = dataSource.createQueryRunner();
    try {
      await runner.query(`SET statement_timeout = ${SHORT_LIMIT_MS}`);

      const failure: unknown = await runner.query("SELECT pg_sleep(2)").catch((e: unknown) => e);

      expect(failure).toBeInstanceOf(QueryFailedError);
      expect((failure as QueryFailedError & { code: string }).code).toBe(QUERY_CANCELED);
      expect(await runner.query("SELECT 1 AS ok")).toEqual([{ ok: 1 }]);
    } finally {
      await runner.query("RESET statement_timeout");
      await runner.release();
    }
  });

  it("Mongo stops an operation at its limit and the connection stays usable", async () => {
    // The slow part runs over one made-up document ($documents), so this needs
    // no rows of its own and passes on CI's empty database too.
    const slow = connection.db
      ?.aggregate(
        [
          { $documents: [{ n: 1 }] },
          {
            $addFields: {
              waited: {
                $function: { body: "function() { sleep(2000); return 1; }", args: [], lang: "js" },
              },
            },
          },
        ],
        { timeoutMS: SHORT_LIMIT_MS },
      )
      .toArray();

    const failure: unknown = await slow?.catch((e: unknown) => e);

    const timedOut =
      failure instanceof mongo.MongoOperationTimeoutError ||
      (failure instanceof mongo.MongoServerError && failure.code === MAX_TIME_EXPIRED);
    expect({ timedOut, failure: timedOut ? "a timeout" : failure }).toEqual({
      timedOut: true,
      failure: "a timeout",
    });
    expect(await connection.db?.command({ ping: 1 })).toMatchObject({ ok: 1 });
  });
});
