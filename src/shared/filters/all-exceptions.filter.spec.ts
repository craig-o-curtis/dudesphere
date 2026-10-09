import {
  ArgumentsHost,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";

import { AllExceptionsFilter } from "./all-exceptions.filter.js";

describe("AllExceptionsFilter", () => {
  // Using DELETE users/me because it's a common way to trigger an exception.
  const request = {
    method: "DELETE",
    originalUrl: "/users/me",
    url: "/users/me",
    headers: { "x-request-id": "req-1" },
    user: { userId: 7 },
  };
  const host = {
    getType: () => "http",
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ArgumentsHost;

  const baseCatch = vi.spyOn(BaseExceptionFilter.prototype, "catch");
  const error = vi.spyOn(Logger.prototype, "error");

  beforeEach(() => {
    baseCatch.mockReset().mockImplementation(() => {});
    error.mockReset().mockImplementation(() => {});
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("logs a 503 with the route, user, request id and cause, then delegates", () => {
    const cause = new Error("socket closed");
    const exception = new ServiceUnavailableException("Could not update abidings", { cause });

    new AllExceptionsFilter().catch(exception, host);

    expect(error).toHaveBeenCalledWith(
      "DELETE /users/me failed for user 7 (request req-1): Could not update abidings",
      cause.stack,
    );
    expect(baseCatch).toHaveBeenCalledWith(exception, host);
  });

  it("logs the context of an unknown error and leaves its stack to BaseExceptionFilter", () => {
    const exception = new Error("boom");

    new AllExceptionsFilter().catch(exception, host);

    expect(error).toHaveBeenCalledWith(
      "DELETE /users/me failed for user 7 (request req-1): boom",
      undefined,
    );
    expect(baseCatch).toHaveBeenCalledWith(exception, host);
  });

  it("stays silent on a 404", () => {
    const exception = new NotFoundException("User #7 not found");

    new AllExceptionsFilter().catch(exception, host);

    expect(error).not.toHaveBeenCalled();
    expect(baseCatch).toHaveBeenCalledWith(exception, host);
  });

  // Nothing else logs an HttpException, so without a cause its own stack is
  // the only trace of where the 503 came from.
  it("logs a 503's own stack when it has no cause", () => {
    const exception = new ServiceUnavailableException("Could not read the current UTC time");

    new AllExceptionsFilter().catch(exception, host);

    expect(error).toHaveBeenCalledWith(
      "DELETE /users/me failed for user 7 (request req-1): Could not read the current UTC time",
      exception.stack,
    );
  });

  it("keeps the text of a cause that is not an Error", () => {
    const exception = new ServiceUnavailableException("Could not update abidings", {
      cause: "socket closed",
    });

    new AllExceptionsFilter().catch(exception, host);

    expect(error).toHaveBeenCalledWith(
      "DELETE /users/me failed for user 7 (request req-1): Could not update abidings",
      `${exception.stack}\nCaused by: socket closed`,
    );
  });

  // body-parser throws errors shaped like this one, built by the http-errors
  // package: not an HttpException, but carrying the status Nest answers with.
  describe("an error that carries its own statusCode", () => {
    const withStatus = (statusCode: number) =>
      Object.assign(new Error("request entity too large"), {
        statusCode,
        status: statusCode,
        expose: statusCode < 500,
      });

    it("stays silent when the status is a 4xx", () => {
      const exception = withStatus(413);

      new AllExceptionsFilter().catch(exception, host);

      expect(error).not.toHaveBeenCalled();
      expect(baseCatch).toHaveBeenCalledWith(exception, host);
    });

    it("logs the context when the status is a 5xx", () => {
      const exception = withStatus(502);

      new AllExceptionsFilter().catch(exception, host);

      expect(error).toHaveBeenCalledWith(
        "DELETE /users/me failed for user 7 (request req-1): request entity too large",
        undefined,
      );
    });
  });
});
