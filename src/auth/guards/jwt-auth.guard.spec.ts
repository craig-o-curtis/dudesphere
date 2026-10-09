import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";

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

    await expect(attempt).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(attempt).rejects.toMatchObject({ errorCode: "TOKEN_MISSING" });
    expect(verifyAsync).not.toHaveBeenCalled();
  });

  it("throws 401 when the header is not a Bearer token", async () => {
    const request = { headers: { authorization: "Basic abc123" } };
    const attempt = guard.canActivate(contextFor(request));

    await expect(attempt).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(attempt).rejects.toMatchObject({ errorCode: "TOKEN_MISSING" });
    expect(verifyAsync).not.toHaveBeenCalled();
  });

  // A public route is reached by callers with no token at all, so the guard
  // must not look at the header.
  it("lets a @Public() route through without reading the header", async () => {
    getAllAndOverride.mockReturnValue(true);

    await expect(guard.canActivate(contextFor({ headers: {} }))).resolves.toBe(true);

    expect(verifyAsync).not.toHaveBeenCalled();
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
