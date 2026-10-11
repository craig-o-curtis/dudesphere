import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { UserRole } from "../../users/user.entity.js";
import { TokenMissingException } from "../exceptions/token-missing.exception.js";
import { RolesGuard } from "./roles.guard.js";

describe("RolesGuard", () => {
  // What the list @Auth() stored on the route reads back as.
  const getAllAndOverride = vi.fn();
  const guard = new RolesGuard({ getAllAndOverride } as unknown as Reflector);

  // A fake ExecutionContext. getHandler and getClass are only there to be
  // handed to Reflector, which is mocked, so their values do not matter.
  function contextFor(request: object) {
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => () => undefined,
      getClass: () => class {},
    } as unknown as ExecutionContext;
  }

  function signedIn(role: UserRole) {
    return contextFor({ user: { userId: 1, username: "walter", role } });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should be defined", () => {
    expect(guard).toBeDefined();
  });

  // A @Public() route carries no @Auth(), so there is no list and nothing
  // for this guard to check. An anonymous caller passes.
  it("lets anyone through a route with no @Auth()", () => {
    getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(contextFor({}))).toBe(true);
  });

  // @Auth() with no roles stores an empty list: signed in, any role.
  it("lets any signed-in caller through when the roles list is empty", () => {
    getAllAndOverride.mockReturnValue([]);

    expect(guard.canActivate(signedIn(UserRole.USER))).toBe(true);
    expect(guard.canActivate(signedIn(UserRole.ADMIN))).toBe(true);
  });

  // Unreachable while JwtAuthGuard runs first. Pinned because it is what
  // makes @Auth() mean "signed in" in this guard too.
  it("throws TokenMissingException when the roles list is empty and nobody is signed in", () => {
    getAllAndOverride.mockReturnValue([]);
    function attempt() {
      return guard.canActivate(contextFor({}));
    }

    expect(attempt).toThrow(TokenMissingException);
    expect(attempt).toThrow(expect.objectContaining({ errorCode: "TOKEN_MISSING" }));
  });

  it("lets an admin through a route that requires admin", () => {
    getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

    expect(guard.canActivate(signedIn(UserRole.ADMIN))).toBe(true);
  });

  // 403, not 401: the caller proved who they are and is still not allowed.
  // Before this guard existed, HashtagsController threw 401 here by hand.
  it("throws ForbiddenException when a user hits an admin route", () => {
    getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    function attempt() {
      return guard.canActivate(signedIn(UserRole.USER));
    }

    expect(attempt).toThrow(ForbiddenException);
    expect(attempt).toThrow(expect.objectContaining({ errorCode: "ROLE_REQUIRED" }));
  });

  // Unreachable while JwtAuthGuard runs first, which is why it is worth
  // pinning: a role rule with nobody to check is a missing identity, so 401.
  it("throws TokenMissingException when a role is required and nobody is signed in", () => {
    getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    function attempt() {
      return guard.canActivate(contextFor({}));
    }

    expect(attempt).toThrow(TokenMissingException);
    expect(attempt).toThrow(expect.objectContaining({ errorCode: "TOKEN_MISSING" }));
  });
});
