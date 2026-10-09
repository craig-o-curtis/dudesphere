import {
  ArgumentsHost,
  ConflictException,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { mongo } from "mongoose";

import { AllExceptionsFilter } from "./all-exceptions.filter.js";
import { DUPLICATE_KEY, MongoErrorFilter } from "./mongo-error.filter.js";

describe("MongoErrorFilter", () => {
  const host = {} as ArgumentsHost;

  // Every outcome goes to AllExceptionsFilter.catch, so what is passed there
  // is the whole of the filter's behaviour.
  const baseCatch = vi.spyOn(AllExceptionsFilter.prototype, "catch");

  beforeEach(() => {
    baseCatch.mockReset().mockImplementation(() => {});
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("turns a duplicate key into a 409 that keeps the driver error as cause", () => {
    const exception = new mongo.MongoServerError({
      message: "E11000 duplicate key",
      code: DUPLICATE_KEY,
    });

    new MongoErrorFilter().catch(exception, host);

    const [passed] = baseCatch.mock.calls[0];
    expect(passed).toBeInstanceOf(ConflictException);
    expect((passed as ConflictException).message).toBe("That value is already taken");
    expect((passed as ConflictException).cause).toBe(exception);
  });

  it("turns a network error into a 503", () => {
    const exception = new mongo.MongoNetworkError("socket closed");

    new MongoErrorFilter().catch(exception, host);

    const [passed] = baseCatch.mock.calls[0];
    expect(passed).toBeInstanceOf(ServiceUnavailableException);
    expect((passed as ServiceUnavailableException).cause).toBe(exception);
  });

  it("passes any other server error through unchanged, so it stays a 500", () => {
    const exception = new mongo.MongoServerError({ message: "BadValue", code: 2 });

    new MongoErrorFilter().catch(exception, host);

    expect(baseCatch.mock.calls[0][0]).toBe(exception);
  });
});
