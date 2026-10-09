import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";

import { TokenMissingException } from "../../shared/exceptions/token-missing.exception.js";
import { UserRole } from "../../users/user.entity.js";
import { JwtAuthGuard } from "./jwt-auth.guard.js";

describe("JwtAuthGuard", () => {
  const verifyAsync = vi.fn();
  // The guard asks this whether the route is @Public(). Undefined means it is
  // not, which is the case for every test but the last one.
  const getAllAndOverride = vi.fn();
  const guard = new JwtAuthGuard(
    { verifyAsync } as unknown as JwtService,
    {
      getAllAndOverride,
    } as unknown as Reflector,
  );

  // A fake ExecutionContext that hands the guard our request object. The two
  // getters are what Reflector is handed to read metadata from.
  const contextFor = (request: object) =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => () => undefined,
      getClass: () => class {},
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    vi.clearAllMocks();
    getAllAndOverride.mockReturnValue(undefined);
  });

  it("puts the token's user on the request", async () => {
    verifyAsync.mockResolvedValue({ sub: 25, username: "walter", role: UserRole.USER });
    const request: { headers: object; user?: unknown } = {
      headers: { authorization: "Bearer signed.jwt.token" },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);

    expect(verifyAsync).toHaveBeenCalledWith("signed.jwt.token");
    expect(request.user).toEqual({ userId: 25, username: "walter", role: UserRole.USER });
  });

  it("throws 401 when there is no Authorization header", async () => {
    const attempt = guard.canActivate(contextFor({ headers: {} }));

    await expect(attempt).rejects.toBeInstanceOf(TokenMissingException);
    await expect(attempt).rejects.toMatchObject({ errorCode: "TOKEN_MISSING" });
    expect(verifyAsync).not.toHaveBeenCalled();
  });

  it("throws 401 when the header is not a Bearer token", async () => {
    const request = { headers: { authorization: "Basic abc123" } };
    const attempt = guard.canActivate(contextFor(request));

    await expect(attempt).rejects.toBeInstanceOf(TokenMissingException);
    await expect(attempt).rejects.toMatchObject({ errorCode: "TOKEN_MISSING" });
    expect(verifyAsync).not.toHaveBeenCalled();
  });

  // On a public route the token is optional. Nobody has to send one, but a
  // caller who sends a good one is still that user.
  describe("on a @Public() route", () => {
    beforeEach(() => {
      getAllAndOverride.mockReturnValue(true);
    });

    it("lets a caller with no token through, and verifies nothing", async () => {
      const request: { headers: object; user?: unknown } = { headers: {} };

      await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);

      expect(verifyAsync).not.toHaveBeenCalled();
      expect(request.user).toBeUndefined();
    });

    // Without this a fault on a public route was logged as "anonymous" even
    // for a signed-in caller.
    it("puts the user on the request when the token is good", async () => {
      verifyAsync.mockResolvedValue({ sub: 25, username: "walter", role: UserRole.USER });
      const request: { headers: object; user?: unknown } = {
        headers: { authorization: "Bearer signed.jwt.token" },
      };

      await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);

      expect(request.user).toEqual({ userId: 25, username: "walter", role: UserRole.USER });
    });

    // An expired token must not lock anyone out of a page that needs none.
    it("still lets the caller through, as nobody, when the token is bad", async () => {
      verifyAsync.mockRejectedValue(new Error("jwt expired"));
      const request: { headers: object; user?: unknown } = {
        headers: { authorization: "Bearer stale.jwt.token" },
      };

      await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);

      expect(request.user).toBeUndefined();
    });
  });

  it("throws 401 when the token is forged or expired, and keeps the reason as cause", async () => {
    const reason = new Error("jwt expired");
    verifyAsync.mockRejectedValue(reason);
    const request: { headers: object; user?: unknown } = {
      headers: { authorization: "Bearer stale.jwt.token" },
    };

    await expect(guard.canActivate(contextFor(request))).rejects.toMatchObject({
      message: "Invalid or expired token",
      errorCode: "TOKEN_INVALID",
      cause: reason,
    });
    expect(request.user).toBeUndefined();
  });
});
