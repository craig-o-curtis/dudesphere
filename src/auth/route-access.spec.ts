import { accessOf, findRoutes } from "../../test/routes.js";

// A guard test. It reads the routes from the controllers themselves, not from
// a list kept in this file, so a new route or a new controller is covered
// without anyone remembering to add a case. test/routes.ts does the reading.
//
// Two global guards run on every route. AuthenticationModule's guard needs a
// signed-in user unless the route is @Public(). AuthorizationModule's guard
// then denies any route that declares no access at all. That second rule is
// safe, but it fails at request time: a route someone forgot to label answers
// 401 or 403 to everyone, and only a request finds out. This test finds out
// first. Every route must declare at least one of:
//
//   @Public()       anyone, no sign-in (from @nestjs/authentication)
//   @Can.Anyone()   any signed-in member (from @nestjs/authorization)
//   @Can(P, "x")    a signed-in member that policy P allows to do "x"
//
// A label on the controller class counts, as it does for the guards.
//
// This proves the label is there. test/route-access.e2e-spec.ts proves the
// guards act on it.

const routes = await findRoutes();

// The routes that sign a caller in, or help one who cannot sign in. A caller
// here has no token yet, or an expired one, so each must stay @Public().
const SIGN_IN_ROUTES = [
  "POST /auth/token",
  "POST /auth/token/refresh",
  "POST /auth/token/revoke",
  "POST /auth/sign-up",
  "POST /auth/password/forgot",
  "POST /auth/password/reset",
];

describe("every route says who may call it", () => {
  it("finds the app's routes", () => {
    // Without this, a rename that broke the lookup would leave the test
    // below with nothing to check, and it would pass.
    expect(routes.length).toBeGreaterThan(0);
  });

  it.each(routes)("$name declares @Public(), @Can.Anyone() or @Can()", (route) => {
    const { isPublic, anyone, checks } = accessOf(route);

    expect(isPublic || anyone || checks.length > 0).toBe(true);
  });
});

describe("the sign-in routes stay public", () => {
  it.each(SIGN_IN_ROUTES)("%s is @Public()", (request) => {
    const route = routes.find((candidate) => candidate.request === request);

    // A moved or renamed route should fail here, not drop out of the check.
    expect(route).toBeDefined();
    expect(accessOf(route!).isPublic).toBe(true);
  });
});
