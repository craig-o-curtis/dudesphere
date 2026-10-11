import { Throttle } from "@nestjs/throttler";

import {
  ACCOUNT_THROTTLER,
  THROTTLE_ACCOUNT_FIELD_KEY,
  ThrottleByAccount,
} from "./throttle-by-account.decorator.js";

const LIMIT = { limit: 5, ttl: 900_000 };

// The first route uses the decorator under test. The second carries the plain
// @Throttle it stands in for, to compare against.
class Routes {
  @ThrottleByAccount("identifier", LIMIT)
  login(this: void) {}

  @Throttle({ [ACCOUNT_THROTTLER]: LIMIT })
  plainThrottle(this: void) {}
}

/** Everything the decorators stored on a route, by key. */
function metadataOn(route: object): Record<string, unknown> {
  const keys = Reflect.getMetadataKeys(route) as string[];
  return Object.fromEntries(keys.map((key) => [key, Reflect.getMetadata(key, route)]));
}

describe("@ThrottleByAccount", () => {
  const routes = new Routes();

  it("stores the name of the body field that holds the account", () => {
    expect(Reflect.getMetadata(THROTTLE_ACCOUNT_FIELD_KEY, routes.login)).toBe("identifier");
  });

  // Compared with what @Throttle itself writes, so this spec does not have to
  // know the keys @nestjs/throttler uses.
  it("sets the limit of the account count, as @Throttle would", () => {
    const { [THROTTLE_ACCOUNT_FIELD_KEY]: _field, ...limits } = metadataOn(routes.login);

    expect(limits).toEqual(metadataOn(routes.plainThrottle));
    expect(Object.keys(limits).length).toBeGreaterThan(0);
  });
});
