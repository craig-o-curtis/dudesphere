import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
  Logger,
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

  it("passes any other server error through unchanged, so it stays a 500", () => {
    const exception = new mongo.MongoServerError({ message: "BadValue", code: 2 });

    new MongoErrorFilter().catch(exception, host);

    expect(baseCatch.mock.calls[0][0]).toBe(exception);
  });
});
