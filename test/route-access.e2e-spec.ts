import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types.js";

import { configureApp } from "./../src/app-setup.js";
import { AppModule } from "./../src/app.module.js";
import { UserRole } from "./../src/users/user.entity.js";
import { bearer, tokenFor } from "./auth-helpers.js";
import { listenOnLoopback } from "./listen-on-loopback.js";
import { accessOf, findRoutes, type Route } from "./routes.js";

// Proves the guards on every route, over real HTTP. The unit route-access
// spec proves each route carries a label. This one proves the running app
// acts on it: the guards are registered, they run in the right order, and
// they refuse the caller the label says to refuse.
//
// The routes come from the controllers, so a new route is covered with no
// case to add here.
//
// Needs the databases running. It signs up one e2e- member for each role it
// needs a token for, and writes nothing else. A guard runs before the pipes
// and the handler, so a refused request never reaches either, and the public
// routes are called with no body, which their validation turns away.

const routes = await findRoutes();

const publicRoutes = routes.filter((route) => accessOf(route).isPublic);
const guardedRoutes = routes.filter((route) => !accessOf(route).isPublic);

/** A role the route does not allow, or undefined when it allows every role. */
function roleLeftOut(route: Route): UserRole | undefined {
  const allowed = accessOf(route).roles ?? [];
  return allowed.length > 0
    ? Object.values(UserRole).find((role) => !allowed.includes(role))
    : undefined;
}

const roleRoutes = guardedRoutes.filter((route) => roleLeftOut(route) !== undefined);

describe("Route access (e2e)", () => {
  let app: INestApplication<App>;

  // A guard never reads a route param, so any value will do for :id or :slug.
  function call({ verb, path }: Route) {
    return request(app.getHttpServer())[verb](path.replace(/:[A-Za-z]+/g, "1"));
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Same global pipes, filters and interceptor as main.ts. See src/app-setup.ts.
    configureApp(app);
    await listenOnLoopback(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it("finds routes of every kind", () => {
    // Without this, a rename that broke the lookup would leave the tables
    // below empty, and they would pass.
    expect(publicRoutes.length).toBeGreaterThan(0);
    expect(guardedRoutes.length).toBeGreaterThan(0);
    expect(roleRoutes.length).toBeGreaterThan(0);
  });

  describe("a route that is not @Public() refuses a caller with no token", () => {
    it.each(guardedRoutes)("$request answers 401", async (route) => {
      const response = await call(route).expect(401);

      expect(response.body).toMatchObject({ errorCode: "TOKEN_MISSING" });
    });
  });

  describe("a route limited to a role refuses a signed-in caller without it", () => {
    it.each(roleRoutes)("$request answers 403", async (route) => {
      const token = await tokenFor(app, roleLeftOut(route) as UserRole);

      const response = await call(route).set(bearer(token)).expect(403);

      expect(response.body).toMatchObject({ errorCode: "ROLE_REQUIRED" });
    });
  });

  describe("a @Public() route lets a caller with no token past the guards", () => {
    // The status depends on the route: 200 for a list, 400 where the empty
    // body fails validation, 404 for a made-up id. Only 401 and 403 would
    // mean a guard refused.
    it.each(publicRoutes)("$request answers neither 401 nor 403", async (route) => {
      const response = await call(route);

      expect([401, 403]).not.toContain(response.status);
    });
  });
});
