import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

import type { UserRole } from "./../src/users/user.entity.js";

// The token helpers the e2e suites share, so each suite does not carry its
// own copy.

/** The Authorization header for a token, in the shape supertest's set() takes. */
export function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

/**
 * A token for a caller with the given role, signed by the app's own
 * JwtService. No user row backs it. The guards read the role from the token
 * and look nothing up, so a suite that uses this does not depend on a seeded
 * user.
 */
export function tokenFor(app: INestApplication, role: UserRole) {
  return app.get(JwtService).signAsync({ sub: 2_000_000_000, username: "e2e", role });
}
