import { CallHandler, ExecutionContext, Logger } from "@nestjs/common";
import { firstValueFrom, NEVER, of, throwError, TimeoutError } from "rxjs";

import { TimeLimitExceededException } from "../exceptions/time-limit-exceeded.exception.js";
import { TimeoutInterceptor } from "./timeout.interceptor.js";

describe("TimeoutInterceptor", () => {
  const request = {
    method: "DELETE",
    originalUrl: "/users/me",
    headers: { "x-request-id": "req-1" },
  };
  const context = {
    getType: () => "http",
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  const warn = vi.spyOn(Logger.prototype, "warn");

  beforeEach(() => {
    warn.mockReset().mockImplementation(() => {});
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  // 20 ms, not the real limit, so the slow case does not slow the suite.
  function run(handler: CallHandler) {
    return firstValueFrom(new TimeoutInterceptor(20).intercept(context, handler));
  }

  it("passes the handler's value through when it answers in time", async () => {
    await expect(run({ handle: () => of("abide") })).resolves.toBe("abide");

    expect(warn).not.toHaveBeenCalled();
  });

  it("turns a handler that never answers into a 408 and logs which request it was", async () => {
    const attempt = run({ handle: () => NEVER });

    await expect(attempt).rejects.toBeInstanceOf(TimeLimitExceededException);
    await expect(attempt).rejects.toMatchObject({ cause: expect.any(TimeoutError) });
    expect(warn).toHaveBeenCalledWith("DELETE /users/me timed out after 20 ms (request req-1)");
  });

  // Only a timeout becomes a 408. A handler's own error has to reach the
  // exception filters as it is.
  it("passes the handler's own error through unchanged", async () => {
    const failure = new Error("boom");

    await expect(run({ handle: () => throwError(() => failure) })).rejects.toBe(failure);

    expect(warn).not.toHaveBeenCalled();
  });
});
