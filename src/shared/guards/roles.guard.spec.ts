import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { UserRole } from "../../users/user.entity.js";
import { TokenMissingException } from "../exceptions/token-missing.exception.js";
import { RolesGuard } from "./roles.guard.js";

describe("RolesGuard", () => {
  // What the @Roles() metadata on the route reads back as.
  const getAllAndOverride = vi.fn();
  const guard = new RolesGuard({ getAllAndOverride } as unknown as Reflector);

  // A fake ExecutionContext. getHandler and getClass are only there to be
  // handed to Reflector, which is mocked, so their values do not matter.
  const contextFor = (request: object) =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => () => undefined,
      getClass: () => class {},
    }) as unknown as ExecutionContext;

  const signedIn = (role: UserRole) =>
    contextFor({ user: { userId: 1, username: "walter", role } });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should be defined", () => {
    expect(guard).toBeDefined();
  });

  // Most routes carry no @Roles at all. Those are open to any signed-in
  // caller, which JwtAuthGuard has already checked.
  it("lets a route through when it asks for no roles", () => {
    getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(signedIn(UserRole.USER))).toBe(true);
  });

  // An empty array is the same as no rule. Guarding against it means
  // `@Roles()` with no arguments cannot lock a route against everyone.
  it("lets a route through when its roles list is empty", () => {
    getAllAndOverride.mockReturnValue([]);

    expect(guard.canActivate(signedIn(UserRole.USER))).toBe(true);
  });

  it("lets an admin through a route that requires admin", () => {
    getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

    expect(guard.canActivate(signedIn(UserRole.ADMIN))).toBe(true);
  });

  // 403, not 401: the caller proved who they are and is still not allowed.
  // Before this guard existed, HashtagsController threw 401 here by hand.
  it("throws ForbiddenException when a user hits an admin route", () => {
    getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    const attempt = () => guard.canActivate(signedIn(UserRole.USER));

    expect(attempt).toThrow(ForbiddenException);
    expect(attempt).toThrow(expect.objectContaining({ errorCode: "ROLE_REQUIRED" }));
  });

  // Unreachable while JwtAuthGuard runs first, which is why it is worth
  // pinning: a role rule with nobody to check is a missing identity, so 401.
  it("throws TokenMissingException when a role is required and nobody is signed in", () => {
    getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    const attempt = () => guard.canActivate(contextFor({}));

    expect(attempt).toThrow(TokenMissingException);
    expect(attempt).toThrow(expect.objectContaining({ errorCode: "TOKEN_MISSING" }));
  });
});
