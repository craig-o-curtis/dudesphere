import { ArgumentsHost, ConflictException, Logger } from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import { QueryFailedError } from "typeorm";

import { QueryFailedFilter, UNIQUE_VIOLATION } from "./query-failed.filter.js";

describe("QueryFailedFilter", () => {
  const host = {} as ArgumentsHost;

  // TypeORM copies the driver error's fields, `code` among them, onto the
  // QueryFailedError. That is the field the filter reads.
  const queryFailed = (code: string) =>
    new QueryFailedError("INSERT INTO ...", [], Object.assign(new Error("driver error"), { code }));

  // The filter hands every outcome to BaseExceptionFilter.catch, so what it
  // passes there is the whole of its behaviour.
  const baseCatch = vi.spyOn(BaseExceptionFilter.prototype, "catch");

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
    expect(passedHost).toBe(host);
  });

  it("passes every other database error through unchanged, so it stays a 500", () => {
    // 23503 is foreign_key_violation: a real fault, not a conflict.
    const exception = queryFailed("23503");

    new QueryFailedFilter().catch(exception, host);

    expect(baseCatch).toHaveBeenCalledTimes(1);
    expect(baseCatch.mock.calls[0][0]).toBe(exception);
  });
});
