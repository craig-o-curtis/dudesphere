import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

import { JwtAuthGuard } from "./jwt-auth.guard.js";

describe("JwtAuthGuard", () => {
  const verifyAsync = vi.fn();
  const guard = new JwtAuthGuard({ verifyAsync } as unknown as JwtService);

  // A fake ExecutionContext that hands the guard our request object.
  const contextFor = (request: object) =>
    ({ switchToHttp: () => ({ getRequest: () => request }) }) as unknown as ExecutionContext;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("puts the token's user on the request", async () => {
    verifyAsync.mockResolvedValue({ sub: 25, username: "walter", role: "user" });
    const request: { headers: object; user?: unknown } = {
      headers: { authorization: "Bearer signed.jwt.token" },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);

    expect(verifyAsync).toHaveBeenCalledWith("signed.jwt.token");
    expect(request.user).toEqual({ userId: 25, username: "walter", role: "user" });
  });

  it("throws 401 when there is no Authorization header", async () => {
    await expect(guard.canActivate(contextFor({ headers: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(verifyAsync).not.toHaveBeenCalled();
  });

  it("throws 401 when the header is not a Bearer token", async () => {
    const request = { headers: { authorization: "Basic abc123" } };

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(verifyAsync).not.toHaveBeenCalled();
  });

  it("throws 401 when the token is forged or expired", async () => {
    verifyAsync.mockRejectedValue(new Error("jwt expired"));
    const request: { headers: object; user?: unknown } = {
      headers: { authorization: "Bearer stale.jwt.token" },
    };

    await expect(guard.canActivate(contextFor(request))).rejects.toThrow(
      "Invalid or expired token",
    );
    expect(request.user).toBeUndefined();
  });
});
