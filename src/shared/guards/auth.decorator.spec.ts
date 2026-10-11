import { Reflector } from "@nestjs/core";

import { UserRole } from "../../users/user.entity.js";
import { Auth, ROLES_KEY } from "./auth.decorator.js";

// Stand-ins for three routes: signed in, admin only, and one with no @Auth().
class Routes {
  @Auth()
  signedIn(this: void) {}

  @Auth(UserRole.ADMIN)
  adminOnly(this: void) {}

  noAuth(this: void) {}
}

describe("@Auth", () => {
  const reflector = new Reflector();
  const routes = new Routes();

  // An empty list, not nothing. RolesGuard tells the two apart: an empty list
  // is a route that needs a signed-in caller, and nothing is a route with no
  // @Auth() at all.
  it("stores an empty list when it names no roles", () => {
    expect(reflector.get(ROLES_KEY, routes.signedIn)).toEqual([]);
  });

  it("stores the roles it names", () => {
    expect(reflector.get(ROLES_KEY, routes.adminOnly)).toEqual([UserRole.ADMIN]);
  });

  it("stores nothing on a route that does not carry it", () => {
    expect(reflector.get(ROLES_KEY, routes.noAuth)).toBeUndefined();
  });
});
