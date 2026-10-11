import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";

import { UserRole } from "../../users/user.entity.js";
import { UsersService } from "../../users/users.service.js";
import { TokenMissingException } from "../exceptions/token-missing.exception.js";
import { JwtAuthGuard } from "./jwt-auth.guard.js";

describe("JwtAuthGuard", () => {
  const verifyAsync = vi.fn();
  // The guard asks this whether the route is @Public(). Undefined means it is
  // not, which is the case for every test but the last one.
  const getAllAndOverride = vi.fn();
  // The guard asks this who the token's user is today. Null means nobody:
  // the account is closed, or never existed.
  const getUserForToken = vi.fn();
  const guard = new JwtAuthGuard(
    { verifyAsync } as unknown as JwtService,
    {
      getAllAndOverride,
    } as unknown as Reflector,
    { getUserForToken } as unknown as UsersService,
  );

  // What a verified token holds, and the user the database has for it.
  const payload = { sub: 25, username: "walter", iat: 1_800_000_000 };
  const walter = { userId: 25, username: "walter", role: UserRole.USER };

  // A fake ExecutionContext that hands the guard our request object. The two
  // getters are what Reflector is handed to read metadata from.
  function contextFor(request: object) {
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => () => undefined,
      getClass: () => class {},
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    getAllAndOverride.mockReturnValue(undefined);
    verifyAsync.mockResolvedValue(payload);
    getUserForToken.mockResolvedValue(walter);
  });

  it("looks the token's user up and puts them on the request", async () => {
    const request: { headers: object; user?: unknown } = {
      headers: { authorization: "Bearer signed.jwt.token" },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);

    expect(verifyAsync).toHaveBeenCalledWith("signed.jwt.token");
    // The id and the time the token was issued are all the guard takes from it.
    expect(getUserForToken).toHaveBeenCalledWith(25, 1_800_000_000);
    expect(request.user).toEqual(walter);
  });

  // The heart of it. A token is a snapshot from login and the database is
  // now, so the database wins: an old token that still says "admin", or
  // carries an old username, changes nothing.
  it("takes the role and the username from the database, not from the token", async () => {
    verifyAsync.mockResolvedValue({ ...payload, username: "old-name", role: UserRole.ADMIN });
    const request: { headers: object; user?: unknown } = {
      headers: { authorization: "Bearer signed.jwt.token" },
    };

    await guard.canActivate(contextFor(request));

    expect(request.user).toEqual({ userId: 25, username: "walter", role: UserRole.USER });
  });

  // A real token, correctly signed, for an account that was closed after
  // login. The same answer as a forged one, so a caller cannot tell which.
  it("throws 401 when the token is real but its user is gone", async () => {
    getUserForToken.mockResolvedValue(null);
    const request: { headers: object; user?: unknown } = {
      headers: { authorization: "Bearer signed.jwt.token" },
    };

    await expect(guard.canActivate(contextFor(request))).rejects.toMatchObject({
      message: "Invalid or expired token",
      errorCode: "TOKEN_INVALID",
    });
    expect(request.user).toBeUndefined();
  });

  // Not a 401. The token may be fine, and telling the client to log in again
  // would not help.
  it("lets a database failure through as it is", async () => {
    const failure = new Error("connection refused");
    getUserForToken.mockRejectedValue(failure);
    const request = { headers: { authorization: "Bearer signed.jwt.token" } };

    await expect(guard.canActivate(contextFor(request))).rejects.toBe(failure);
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
      const request: { headers: object; user?: unknown } = {
        headers: { authorization: "Bearer signed.jwt.token" },
      };

      await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);

      expect(request.user).toEqual(walter);
    });

    it("still lets the caller through, as nobody, when the token's user is gone", async () => {
      getUserForToken.mockResolvedValue(null);
      const request: { headers: object; user?: unknown } = {
        headers: { authorization: "Bearer signed.jwt.token" },
      };

      await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);

      expect(request.user).toBeUndefined();
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
    // A token that fails verification never reaches the database.
    expect(getUserForToken).not.toHaveBeenCalled();
  });
});
