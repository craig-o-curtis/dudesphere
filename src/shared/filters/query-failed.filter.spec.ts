import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Logger,
  RequestTimeoutException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { QueryFailedError } from "typeorm";

import { AllExceptionsFilter } from "./all-exceptions.filter.js";
import { QueryFailedFilter, UNIQUE_VIOLATION } from "./query-failed.filter.js";

describe("QueryFailedFilter", () => {
  // The request the filter names in its warnings.
  const request = {
    method: "PATCH",
    originalUrl: "/profiles/me",
    url: "/profiles/me",
    headers: { "x-request-id": "req-1" },
    user: { userId: 7 },
  };
  const host = {
    getType: () => "http",
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ArgumentsHost;

  // TypeORM copies the driver error's fields, `code` among them, onto the
  // QueryFailedError. That is the field the filter reads.
  const queryFailed = (code: string, driverMessage = "driver error") =>
    new QueryFailedError("INSERT INTO ...", [], Object.assign(new Error(driverMessage), { code }));

  // The filter hands every outcome to AllExceptionsFilter.catch, so what it
  // passes there is the whole of its behaviour.
  const baseCatch = vi.spyOn(AllExceptionsFilter.prototype, "catch");
  const warn = vi.spyOn(Logger.prototype, "warn");

  beforeEach(() => {
    baseCatch.mockReset().mockImplementation(() => {});
    warn.mockReset().mockImplementation(() => {});
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("turns a unique violation into a 409 that hides the driver message", () => {
    new QueryFailedFilter().catch(queryFailed(UNIQUE_VIOLATION), host);

    expect(baseCatch).toHaveBeenCalledTimes(1);
    const [passed, passedHost] = baseCatch.mock.calls[0];
    expect(passed).toBeInstanceOf(ConflictException);
    expect((passed as ConflictException).message).toBe("That value is already taken");
    expect((passed as ConflictException).errorCode).toBe("VALUE_TAKEN");
    expect(passedHost).toBe(host);
  });

  // pg reports a socket that closed under a running query with this message
  // and no code. TypeORM wraps it like any other query failure.
  it("turns a connection lost mid-query into a 503", () => {
    const exception = new QueryFailedError(
      "SELECT ...",
      [],
      new Error("Connection terminated unexpectedly"),
    );

    new QueryFailedFilter().catch(exception, host);

    const [passed] = baseCatch.mock.calls[0];
    expect(passed).toBeInstanceOf(ServiceUnavailableException);
    expect((passed as ServiceUnavailableException).errorCode).toBe("DATABASE_UNAVAILABLE");
    expect((passed as ServiceUnavailableException).cause).toBe(exception);
  });

  it("turns a Postgres shutdown into a 503", () => {
    // 57P01 is admin_shutdown.
    new QueryFailedFilter().catch(queryFailed("57P01"), host);

    const [passed] = baseCatch.mock.calls[0];
    expect(passed).toBeInstanceOf(ServiceUnavailableException);
    expect((passed as ServiceUnavailableException).errorCode).toBe("DATABASE_UNAVAILABLE");
  });

  // 57014 is query_canceled: what a statement gets when it runs past the
  // statement_timeout set in app.module.ts.
  describe("a statement Postgres cancelled for running too long", () => {
    it("becomes the same 408 the request time limit gives", () => {
      const exception = queryFailed("57014", "canceling statement due to statement timeout");

      new QueryFailedFilter().catch(exception, host);

      const [passed] = baseCatch.mock.calls[0];
      expect(passed).toBeInstanceOf(RequestTimeoutException);
      expect((passed as RequestTimeoutException).getResponse()).toEqual({
        statusCode: 408,
        message: "Request Timeout",
      });
      expect((passed as RequestTimeoutException).cause).toBe(exception);
    });

    it("logs a warning that names the route, so the slow query can be found", () => {
      new QueryFailedFilter().catch(queryFailed("57014"), host);

      expect(warn).toHaveBeenCalledWith(
        "PATCH /profiles/me for user 7 (request req-1): Postgres cancelled a query that ran " +
          "past its time limit",
      );
    });
  });

  // The safety net for a value a DTO let through. The caller sent something
  // the column cannot hold, so it is their 400, with a fixed message: the
  // driver's own text can quote the value.
  describe("a value that does not fit its column", () => {
    it.each([
      ["22001", "a value too long for the column"],
      ["22007", "text that is not a date"],
      ["22008", "a date out of range"],
      ["22021", "a NUL character"],
      ["22P02", "text that is not valid for the type"],
      ["22P05", "a character that cannot be converted"],
    ])("turns %s (%s) into a 400 that hides the driver message", (code) => {
      const exception = queryFailed(code, 'invalid input syntax for type timestamp: "the value"');

      new QueryFailedFilter().catch(exception, host);

      const [passed] = baseCatch.mock.calls[0];
      expect(passed).toBeInstanceOf(BadRequestException);
      expect((passed as BadRequestException).getResponse()).toEqual({
        statusCode: 400,
        message: "A value in the request is not valid",
        error: "Bad Request",
      });
      expect((passed as BadRequestException).cause).toBe(exception);
    });

    // Every hit on this net is a DTO rule that is missing. The warning has to
    // say which route, or nobody can find it.
    it("logs a warning that names the route, the user and the request id", () => {
      new QueryFailedFilter().catch(queryFailed("22001", "value too long"), host);

      expect(warn).toHaveBeenCalledWith(
        "PATCH /profiles/me for user 7 (request req-1): Postgres refused a value a DTO " +
          "should have stopped (22001): value too long",
      );
    });
  });

  // Wrapped, not passed on as it is: the QueryFailedError carries the query's
  // parameters, and whatever reaches Nest's base filter unwrapped gets printed
  // whole. As a cause, only its stack is logged.
  it.each([
    // A real fault, not a conflict and not a bad value.
    ["23503", "a foreign key violation"],
    // Left out of the 400s on purpose. A NOT NULL column the code forgets to
    // set would make every insert raise this, and a 400 would hide it.
    ["23502", "a not-null violation"],
    // Also what a full id sequence raises.
    ["22003", "a number out of range"],
    // Points at our SQL, not at the caller's value.
    ["22012", "a division by zero"],
  ])("wraps %s (%s) in a plain 500 that keeps it as cause", (code) => {
    const exception = queryFailed(code);

    new QueryFailedFilter().catch(exception, host);

    expect(baseCatch).toHaveBeenCalledTimes(1);
    const [passed, passedHost] = baseCatch.mock.calls[0];
    expect(passed).toBeInstanceOf(InternalServerErrorException);
    expect((passed as InternalServerErrorException).getResponse()).toEqual({
      statusCode: 500,
      message: "Internal server error",
    });
    expect((passed as InternalServerErrorException).cause).toBe(exception);
    expect(passedHost).toBe(host);
    expect(warn).not.toHaveBeenCalled();
  });
});
