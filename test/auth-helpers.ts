import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { App } from "supertest/types.js";
import { DataSource } from "typeorm";

import { UserRole } from "./../src/users/user.entity.js";
import { signUp } from "./sign-up.js";

// The token helpers the e2e suites share, so each suite does not carry its
// own copy.
//
// Every token here belongs to a real user. JwtAuthGuard looks the user up on
// each request and takes the role from the database, so a token signed for a
// made-up id, or one that only claims a role, is refused.

/** The Authorization header for a token, in the shape supertest's set() takes. */
export function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

/** A member the suite created, and the token their login returned. */
export interface SignedInUser {
  token: string;
  userId: number;
}

/**
 * Signs up a new `e2e-` member with the given role, logs them in and returns
 * the token. test/global-setup.ts deletes the member when the run ends.
 *
 * No route can make an admin, on purpose, so an admin is made the way the
 * seed makes one: the role is written to the row. The login comes after
 * that, though it would not matter: the role is read on each request.
 */
export async function signedInAs(
  app: INestApplication<App>,
  role: UserRole,
): Promise<SignedInUser> {
  const { sent, user } = await signUp(app);

  if (role !== UserRole.USER) {
    await setRole(app, user.id, role);
  }

  const login = await request(app.getHttpServer())
    .post("/auth/login")
    .send({ identifier: sent.email, password: sent.password })
    .expect(201);
  const { token, userId } = login.body as SignedInUser;
  return { token, userId };
}

/** Writes a member's role straight to the database, as nothing in the API can. */
export async function setRole(
  app: INestApplication<App>,
  userId: number,
  role: UserRole,
): Promise<void> {
  await app.get(DataSource).query(`UPDATE "user" SET "role" = $1 WHERE "id" = $2`, [role, userId]);
}

// One member for each role, for each app. A suite calls tokenFor many times,
// and signing up a new member on every call would be slow for no gain.
const tokens = new WeakMap<object, Map<UserRole, Promise<string>>>();

/**
 * A token for a signed-in member with the given role. The first call for a
 * role signs a member up; later calls in the same suite reuse that member.
 *
 * Use signedInAs when a test needs the member's id, or a member of its own.
 */
export function tokenFor(app: INestApplication<App>, role: UserRole): Promise<string> {
  const forApp = tokens.get(app) ?? new Map<UserRole, Promise<string>>();
  tokens.set(app, forApp);

  const existing = forApp.get(role);
  if (existing) {
    return existing;
  }
  const created = signedInAs(app, role).then(({ token }) => token);
  forApp.set(role, created);
  return created;
}
