// src/shared/guards/route-access.spec.ts
import { accessOf, findRoutes, type Route } from "../../../test/routes.js";

// A guard test. It reads the routes from the controllers themselves, not from
// a list kept in this file, so a new route or a new controller is covered
// without anyone remembering to add a case. test/routes.ts does the reading.
//
// JwtAuthGuard runs on every route, so a route with no decorator already needs
// a token. That rule is safe but invisible: nothing in the controller says so.
// This test makes every route say it, with exactly one of:
//
//   @Public()   anyone, no token
//   @Auth()     a signed-in caller, with one of the roles it lists, if any
//
// This proves the label is there. test/route-access.e2e-spec.ts proves the
// guards act on it.

/** The access decorators a route carries, by name. */
function accessDecorators(route: Route): string[] {
  const { isPublic, roles } = accessOf(route);
  const found: string[] = [];
  if (isPublic) {
    found.push("@Public()");
  }
  if (roles !== undefined) {
    found.push("@Auth()");
  }
  return found;
}

const routes = await findRoutes();

describe("every route says who may call it", () => {
  it("finds the app's routes", () => {
    // Without this, a rename that broke the lookup would leave the test
    // below with nothing to check, and it would pass.
    expect(routes.length).toBeGreaterThan(0);
  });

  it.each(routes)("$name carries exactly one access decorator", (route) => {
    expect(accessDecorators(route)).toHaveLength(1);
  });
});
