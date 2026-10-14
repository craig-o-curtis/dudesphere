import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants.js";

// Reads the app's routes from the controllers themselves, not from a list
// kept in a test. A new route or a new controller is then covered without
// anyone remembering to add a case.

type Handler = (...args: never[]) => unknown;
type ControllerClass = (abstract new (...args: never[]) => object) & {
  prototype: Record<string, unknown>;
};

/** The lowercase verb, which is also the name of the supertest method. */
export type Verb = "get" | "post" | "put" | "patch" | "delete";

export interface Route {
  /** The class and method, such as "UsersController.getUserById". */
  name: string;
  /** The verb and path, such as "GET /users/:id". For a test title. */
  request: string;
  verb: Verb;
  /** The full path, with its params still named: "/users/:id". */
  path: string;
  controller: ControllerClass;
  handler: Handler;
}

/** Who may call a route, as its decorators say. */
export interface RouteAccess {
  /** @Public() from @nestjs/authentication: no sign-in needed. */
  isPublic: boolean;
  /** @Can.Anyone(): any signed-in member. */
  anyone: boolean;
  /** The @Can() checks, as "PolicyName.ability", class-level first. Empty when none. */
  checks: string[];
}

// The keys the two packages write their route metadata under. Neither
// package exports them, so they are copied here from their dist files:
// @nestjs/authorization's authorization.constants.js and
// @nestjs/authentication's authentication.constants.js. The public key is a
// registry symbol, so Symbol.for() here gives the very same symbol.
const CAN_METADATA = "authorization:can";
const CAN_ANYONE_METADATA = "authorization:can-anyone";
const AUTHENTICATION_PUBLIC = Symbol.for("@nestjs/authentication:public");

/** One @Can() requirement, as @Can() stores it. */
interface CanRequirement {
  policy: { name: string };
  ability: string;
}

// This file is test/routes.ts, so "../src/" is src.
const SRC = fileURLToPath(new URL("../src/", import.meta.url));

const VERBS: Partial<Record<RequestMethod, Verb>> = {
  [RequestMethod.GET]: "get",
  [RequestMethod.POST]: "post",
  [RequestMethod.PUT]: "put",
  [RequestMethod.PATCH]: "patch",
  [RequestMethod.DELETE]: "delete",
};

/** @Controller() writes the route prefix onto the class under this key. */
function isController(value: unknown): value is ControllerClass {
  return typeof value === "function" && Reflect.hasMetadata(PATH_METADATA, value);
}

/** @Get(), @Post() and the rest write the HTTP method onto the handler. */
function isHandler(value: unknown): value is Handler {
  return typeof value === "function" && Reflect.hasMetadata(METHOD_METADATA, value);
}

/** The path @Controller() or @Get() stored, with no slash at either end. */
function pathPart(target: object): string {
  const stored = Reflect.getMetadata(PATH_METADATA, target) as string | string[] | undefined;
  const path = Array.isArray(stored) ? stored[0] : stored;
  return (path ?? "").replace(/^\/+|\/+$/g, "");
}

/** "/users/:id" from the "users" on the controller and the ":id" on the handler. */
function fullPath(controller: ControllerClass, handler: Handler): string {
  return `/${[pathPart(controller), pathPart(handler)].filter(Boolean).join("/")}`;
}

/** Every route handler in every *.controller.ts file under src. */
export async function findRoutes(): Promise<Route[]> {
  const files = readdirSync(SRC, { recursive: true, encoding: "utf8" }).filter((file) =>
    file.endsWith(".controller.ts"),
  );

  const routes: Route[] = [];
  for (const file of files) {
    const exported = (await import(pathToFileURL(join(SRC, file)).href)) as Record<string, unknown>;
    for (const controller of Object.values(exported).filter(isController)) {
      for (const method of Object.getOwnPropertyNames(controller.prototype)) {
        const handler = controller.prototype[method];
        if (!isHandler(handler)) {
          continue;
        }
        const verb = VERBS[Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod];
        if (!verb) {
          throw new Error(
            `${controller.name}.${method} uses an HTTP method test/routes.ts does not know`,
          );
        }
        const path = fullPath(controller, handler);
        routes.push({
          name: `${controller.name}.${method}`,
          request: `${verb.toUpperCase()} ${path}`,
          verb,
          path,
          controller,
          handler,
        });
      }
    }
  }
  return routes;
}

/** The @Can() requirements stored on a handler or a controller. */
function canChecks(target: object): string[] {
  const stored = (Reflect.getMetadata(CAN_METADATA, target) ?? []) as CanRequirement[];
  return stored.map(({ policy, ability }) => `${policy.name}.${ability}`);
}

/**
 * What the access decorators on a route say. Read the way the packages'
 * guards read them, the handler first, then its controller. This mirrors
 * routeChecks() in @nestjs/authorization's utils/route-checks.util.js:
 *
 * - @Public() on the method wins over the class, either way. @Authenticate()
 *   writes false, so a method can opt back in under a @Public() class.
 * - @Can.Anyone() counts on the method or the class.
 * - A @Public() or @Can.Anyone() on the method lifts the class's @Can().
 *   A @Can() on the method itself still applies.
 */
export function accessOf({ controller, handler }: Route): RouteAccess {
  const methodPublic = Reflect.getMetadata(AUTHENTICATION_PUBLIC, handler) as boolean | undefined;
  const classPublic = Reflect.getMetadata(AUTHENTICATION_PUBLIC, controller) as boolean | undefined;
  const methodAnyone = Reflect.getMetadata(CAN_ANYONE_METADATA, handler) === true;
  const classAnyone = Reflect.getMetadata(CAN_ANYONE_METADATA, controller) === true;
  const methodOpen = methodPublic === true || methodAnyone;

  return {
    isPublic: (methodPublic ?? classPublic) === true,
    anyone: methodAnyone || classAnyone,
    checks: [...(methodOpen ? [] : canChecks(controller)), ...canChecks(handler)],
  };
}
