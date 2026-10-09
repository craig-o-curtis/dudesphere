import {
  ArgumentsHost,
  ConflictException,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { QueryFailedError } from "typeorm";

import { AllExceptionsFilter } from "./all-exceptions.filter.js";
import { QueryFailedFilter, UNIQUE_VIOLATION } from "./query-failed.filter.js";

describe("QueryFailedFilter", () => {
  const host = {} as ArgumentsHost;

  // TypeORM copies the driver error's fields, `code` among them, onto the
  // QueryFailedError. That is the field the filter reads.
  const queryFailed = (code: string) =>
    new QueryFailedError("INSERT INTO ...", [], Object.assign(new Error("driver error"), { code }));

  // The filter hands every outcome to AllExceptionsFilter.catch, so what it
  // passes there is the whole of its behaviour.
  const baseCatch = vi.spyOn(AllExceptionsFilter.prototype, "catch");

  beforeEach(() => {
    baseCatch.mockReset().mockImplementation(() => {});
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
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

  // Wrapped, not passed on as it is: the QueryFailedError carries the query's
  // parameters, and whatever reaches Nest's base filter unwrapped gets printed
  // whole. As a cause, only its stack is logged.
  it("wraps every other database error in a plain 500 that keeps it as cause", () => {
    // 23503 is foreign_key_violation: a real fault, not a conflict.
    const exception = queryFailed("23503");

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
  });
});
