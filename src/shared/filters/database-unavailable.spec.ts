import { ServiceUnavailableException } from "@nestjs/common";

import { databaseUnavailable, isDatabaseUnreachable } from "./database-unavailable.js";

describe("isDatabaseUnreachable", () => {
  const withCode = (message: string, code: string) => Object.assign(new Error(message), { code });

  // Each of the first two was captured from the pg driver with the server
  // cut off: the first on a new query, the second on a query in flight.
  it.each([
    ["a refused socket", withCode("connect ECONNREFUSED 127.0.0.1:5432", "ECONNREFUSED")],
    ["a socket closed under a query", new Error("Connection terminated unexpectedly")],
    ["a reset socket", withCode("read ECONNRESET", "ECONNRESET")],
    ["an admin shutdown", withCode("terminating connection due to administrator command", "57P01")],
    ["a server still starting up", withCode("the database system is starting up", "57P03")],
    ["too many connections", withCode("sorry, too many clients already", "53300")],
    ["a connection exception (class 08)", withCode("connection failure", "08006")],
  ])("is true for %s", (_what, error) => {
    expect(isDatabaseUnreachable(error)).toBe(true);
  });

  // Postgres answered, so it is reachable. These are faults in the query.
  it.each([
    ["a unique violation", withCode("duplicate key value", "23505")],
    ["a value too long", withCode("value too long for type character varying(96)", "22001")],
    ["a syntax error", withCode("syntax error at or near", "42601")],
    ["a plain Error", new Error("boom")],
    ["something that is not an Error", "ECONNREFUSED"],
    ["nothing", undefined],
  ])("is false for %s", (_what, error) => {
    expect(isDatabaseUnreachable(error)).toBe(false);
  });
});

describe("databaseUnavailable", () => {
  it("builds the 503 with its error code and keeps the driver error as cause", () => {
    const cause = new Error("connect ECONNREFUSED");

    const exception = databaseUnavailable(cause);

    expect(exception).toBeInstanceOf(ServiceUnavailableException);
    expect(exception.getResponse()).toEqual({
      statusCode: 503,
      message: "Database unavailable",
      error: "Service Unavailable",
      errorCode: "DATABASE_UNAVAILABLE",
    });
    expect(exception.cause).toBe(cause);
  });
});
