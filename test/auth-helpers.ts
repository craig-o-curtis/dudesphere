import {
  AUTHENTICATION_MODULE_OPTIONS,
  type AuthenticationModuleOptions,
  JwtSigner,
} from "@nestjs/authentication";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { App } from "supertest/types.js";
import { DataSource } from "typeorm";

import { UserRole } from "./../src/users/user.entity.js";
import { signUp } from "./sign-up.js";

// The token helpers the e2e suites share, so each suite does not carry its
// own copy.
//
// Every token here belongs to a real user. JwtAuth looks the user up on each
// request and takes the role from the database, so a token signed for a
// made-up id, or one that only claims a role, is refused.

/** The Authorization header for a token, in the shape supertest's set() takes. */
export function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

/** A signed-in member: their access token, and their user id. */
export interface SignedInUser {
  token: string;
  userId: number;
}

/**
 * Signs a member in through POST /auth/token and returns their access token
 * and their id. The sign-in answer carries no id, so this asks GET /users/me
 * with the new token, as a client would.
 */
export async function signIn(
  app: INestApplication<App>,
  identifier: string,
  password: string,
): Promise<SignedInUser> {
  const token = await accessTokenFor(app, identifier, password);
  const me = await request(app.getHttpServer()).get("/users/me").set(bearer(token)).expect(200);
  return { token, userId: (me.body as { id: number }).id };
}

/** Signs a member in through POST /auth/token and returns the access token alone. */
export async function accessTokenFor(
  app: INestApplication<App>,
  identifier: string,
  password: string,
): Promise<string> {
  const response = await request(app.getHttpServer())
    .post("/auth/token")
    .send({ identifier, password })
    .expect(200);
  return (response.body as { accessToken: string }).accessToken;
}

/**
 * Signs up a new `e2e-` member with the given role, signs them in and returns
 * the access token. test/global-setup.ts deletes the member when the run ends.
 *
 * No route can make an admin, on purpose, so an admin is made the way the
 * seed makes one: the role is written to the row. The sign-in comes after
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

  return { token: await accessTokenFor(app, sent.email, sent.password), userId: user.id };
}

/** Writes a member's role straight to the database, as nothing in the API can. */
export async function setRole(
  app: INestApplication<App>,
  userId: number,
  role: UserRole,
): Promise<void> {
  await app.get(DataSource).query(`UPDATE "user" SET "role" = $1 WHERE "id" = $2`, [role, userId]);
}

/**
 * The same member's token, as if they had signed in a minute earlier. It is
 * signed with the app's own `accessToken` options, so it is as real as the
 * one passed in.
 *
 * For a test that needs a token that is plainly older than something it is
 * about to do, such as a password change. A token records only the second it
 * was signed in, so a token from a sign-in moments before would be a coin
 * toss. Moving it back a minute settles that with no waiting.
 */
export function signedAMinuteEarlier(app: INestApplication<App>, token: string): string {
  const { accessToken } = app.get<AuthenticationModuleOptions>(AUTHENTICATION_MODULE_OPTIONS);
  if (!accessToken) {
    throw new Error("AuthenticationModule has no accessToken options");
  }
  const { sub, iat } = claimsOf(token);
  // The signer's clock, in milliseconds, set to a minute before the original.
  const signer = new JwtSigner({ ...accessToken, now: () => (iat - 60) * 1000 });
  return signer.sign({ sub });
}

/** The claims of a JWT, read without checking it. Only for tokens a test just got. */
export function claimsOf(token: string): { sub: string; iat: number; exp: number } {
  const [, payload] = token.split(".");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    sub: string;
    iat: number;
    exp: number;
  };
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
