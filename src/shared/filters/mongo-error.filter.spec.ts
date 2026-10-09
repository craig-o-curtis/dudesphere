import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Logger,
  RequestTimeoutException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Error as MongooseError, mongo } from "mongoose";

import { AllExceptionsFilter } from "./all-exceptions.filter.js";
import { DUPLICATE_KEY, MongoErrorFilter } from "./mongo-error.filter.js";

describe("MongoErrorFilter", () => {
  // The request the filter names in its warnings.
  const request = {
    method: "POST",
    originalUrl: "/abidings",
    url: "/abidings",
    headers: { "x-request-id": "req-1" },
    user: { userId: 7 },
  };
  const host = {
    getType: () => "http",
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ArgumentsHost;

  // Every outcome goes to AllExceptionsFilter.catch, so what is passed there
  // is the whole of the filter's behaviour.
  const baseCatch = vi.spyOn(AllExceptionsFilter.prototype, "catch");
  const warn = vi.spyOn(Logger.prototype, "warn");

  beforeEach(() => {
    baseCatch.mockReset().mockImplementation(() => {});
    warn.mockReset().mockImplementation(() => {});
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
    expect((passed as ConflictException).errorCode).toBe("VALUE_TAKEN");
    expect((passed as ConflictException).cause).toBe(exception);
  });

  it("turns a network error into a 503", () => {
    const exception = new mongo.MongoNetworkError("socket closed");

    new MongoErrorFilter().catch(exception, host);

    const [passed] = baseCatch.mock.calls[0];
    expect(passed).toBeInstanceOf(ServiceUnavailableException);
    expect((passed as ServiceUnavailableException).errorCode).toBe("DATABASE_UNAVAILABLE");
    expect((passed as ServiceUnavailableException).cause).toBe(exception);
  });

  // What the driver throws when no server answers in time, for example when
  // Mongo was never reachable. The topology argument is not read here.
  it("turns a server-selection error into a 503", () => {
    const exception = new mongo.MongoServerSelectionError("timed out", {} as never);

    new MongoErrorFilter().catch(exception, host);

    const [passed] = baseCatch.mock.calls[0];
    expect(passed).toBeInstanceOf(ServiceUnavailableException);
    expect((passed as ServiceUnavailableException).errorCode).toBe("DATABASE_UNAVAILABLE");
    expect((passed as ServiceUnavailableException).cause).toBe(exception);
  });

  describe("an operation that ran past its time limit", () => {
    it.each([
      // The driver's own limit, timeoutMS in app.module.ts.
      ["the driver's timeout", () => new mongo.MongoOperationTimeoutError("Timed out")],
      // Mongo's limit, when the server gets there first. 50 is MaxTimeMSExpired.
      [
        "the server's MaxTimeMSExpired",
        () => new mongo.MongoServerError({ message: "operation exceeded time limit", code: 50 }),
      ],
    ])("turns %s into the same 408 the request time limit gives", (_what, build) => {
      const exception = build();

      new MongoErrorFilter().catch(exception, host);

      const [passed] = baseCatch.mock.calls[0];
      expect(passed).toBeInstanceOf(RequestTimeoutException);
      expect((passed as RequestTimeoutException).getResponse()).toEqual({
        statusCode: 408,
        message: "Request Timeout",
      });
      expect((passed as RequestTimeoutException).cause).toBe(exception);
      expect(warn).toHaveBeenCalledWith(
        "POST /abidings for user 7 (request req-1): Mongo gave up on an operation that ran " +
          "past its time limit",
      );
    });
  });

  // The safety net for a value a DTO or a pipe let through. Mongoose raises
  // both of these itself, before any command reaches Mongo.
  describe("a value Mongoose refuses", () => {
    const validationError = () => {
      const error = new MongooseError.ValidationError();
      error.addError(
        "message",
        new MongooseError.ValidatorError({
          path: "message",
          message: "Message cannot exceed 280 characters",
        }),
      );
      return error;
    };
    // What a query raises when a string is given for a Number path.
    const castError = () => new MongooseError.CastError("Number", "not-a-number", "userId");

    it.each([
      ["a ValidationError", validationError],
      ["a CastError", castError],
    ])("turns %s into a 400 that hides Mongoose's message", (_what, build) => {
      const exception = build();

      new MongoErrorFilter().catch(exception, host);

      const [passed] = baseCatch.mock.calls[0];
      expect(passed).toBeInstanceOf(BadRequestException);
      expect((passed as BadRequestException).getResponse()).toEqual({
        statusCode: 400,
        message: "A value in the request is not valid",
        error: "Bad Request",
      });
      expect((passed as BadRequestException).cause).toBe(exception);
    });

    // Every hit on this net is a rule that is missing from a DTO. The warning
    // has to say which route, or nobody can find it.
    it("logs a warning that names the route, the user and the request id", () => {
      new MongoErrorFilter().catch(validationError(), host);

      expect(warn).toHaveBeenCalledWith(
        "POST /abidings for user 7 (request req-1): Mongoose refused a value a DTO should " +
          "have stopped: Validation failed: message: Message cannot exceed 280 characters",
      );
    });
  });

  // Wrapped, not passed on as it is. A Mongo server error can hold the
  // document it refused, and whatever reaches Nest's base filter unwrapped is
  // printed whole. As a cause, only its stack is logged.
  it("wraps any other server error in a plain 500 that keeps it as cause", () => {
    const exception = new mongo.MongoServerError({ message: "BadValue", code: 2 });

    new MongoErrorFilter().catch(exception, host);

    const [passed] = baseCatch.mock.calls[0];
    expect(passed).toBeInstanceOf(InternalServerErrorException);
    expect((passed as InternalServerErrorException).getResponse()).toEqual({
      statusCode: 500,
      message: "Internal server error",
    });
    expect((passed as InternalServerErrorException).cause).toBe(exception);
  });
});
