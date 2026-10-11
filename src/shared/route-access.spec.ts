// src/shared/route-access.spec.ts
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants.js";
import { Reflector } from "@nestjs/core";

import { IS_AUTHENTICATED_KEY, IS_PUBLIC_KEY, ROLES_KEY } from "./auth-metadata.js";

// A guard test. It reads the routes from the controllers themselves, not from
// a list kept in this file, so a new route or a new controller is covered
// without anyone remembering to add a case.
//
// JwtAuthGuard runs on every route, so a route with no decorator already needs
// a token. That rule is safe but invisible: nothing in the controller says so.
// This test makes every route say it, with exactly one of:
//
//   @Public()         anyone, no token
//   @Authenticated()  any signed-in caller
//   @Roles(...)       a signed-in caller with one of those roles

type Handler = (...args: never[]) => unknown;
type ControllerClass = (abstract new (...args: never[]) => object) & {
  prototype: Record<string, unknown>;
};

interface Route {
  name: string;
  controller: ControllerClass;
  handler: Handler;
}

// This file is src/shared/route-access.spec.ts, so ".." is src.
const SRC = fileURLToPath(new URL("..", import.meta.url));
const reflector = new Reflector();

/** @Controller() writes the route prefix onto the class under this key. */
function isController(value: unknown): value is ControllerClass {
  return typeof value === "function" && Reflect.hasMetadata(PATH_METADATA, value);
}

/** @Get(), @Post() and the rest write the HTTP method onto the handler. */
function isHandler(value: unknown): value is Handler {
  return typeof value === "function" && Reflect.hasMetadata(METHOD_METADATA, value);
}

/** Every route handler in every *.controller.ts file under src. */
async function findRoutes(): Promise<Route[]> {
  const files = readdirSync(SRC, { recursive: true, encoding: "utf8" }).filter((file) =>
    file.endsWith(".controller.ts"),
  );

  const routes: Route[] = [];
  for (const file of files) {
    const exported = (await import(pathToFileURL(join(SRC, file)).href)) as Record<string, unknown>;
    for (const controller of Object.values(exported).filter(isController)) {
      for (const method of Object.getOwnPropertyNames(controller.prototype)) {
        const handler = controller.prototype[method];
        if (isHandler(handler)) {
          routes.push({ name: `${controller.name}.${method}`, controller, handler });
        }
      }
    }
  }
  return routes;
}

/**
 * The access decorators that apply to a route. Read the way the guards read
 * them: the handler first, then its controller.
 */
function accessDecorators({ controller, handler }: Route): string[] {
  const targets = [handler, controller];
  const found: string[] = [];
  if (reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets)) {
    found.push("@Public()");
  }
  if (reflector.getAllAndOverride<boolean | undefined>(IS_AUTHENTICATED_KEY, targets)) {
    found.push("@Authenticated()");
  }
  if (reflector.getAllAndOverride<unknown[] | undefined>(ROLES_KEY, targets)) {
    found.push("@Roles()");
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
