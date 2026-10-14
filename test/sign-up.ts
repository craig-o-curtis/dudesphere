import { randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { App } from "supertest/types.js";

// Every e2e sign-up goes through this file, so a change to what sign up takes
// is made here once and not in each suite.

/** What POST /auth/sign-up and POST /users take. */
export interface SignUpBody {
  username: string;
  email: string;
  password: string;
  profile: Record<string, unknown>;
}

/** The parts of the created user the suites read back. */
export interface SignedUpUser {
  id: number;
  username: string;
  email: string;
  createdAt: string;
  updatedAt: string;
  profile: { id: number; displayName: string };
}

/**
 * A sign-up body no other run has used. Pass `overrides` to set a field, or
 * to break one for a test that expects a 400. Fields in `overrides.profile`
 * are added to the profile, so it keeps its display name unless one is given.
 *
 * The email starts with `e2e-`, which is what test/global-setup.ts deletes by.
 * randomUUID, not Date.now(), which the gmt lint rules ban. 8 characters keep
 * the username under its 24-character limit.
 *
 * The display name is "e2e <tag>", with a space. A username cannot hold a
 * space, so a display name made here never equals a username, and a test
 * that checks "no username in this body" cannot pass by accident.
 */
export function signUpBody(overrides: Partial<SignUpBody> = {}): SignUpBody {
  const tag = randomUUID().slice(0, 8);
  return {
    username: `e2e-${tag}`,
    email: `e2e-${tag}@example.com`,
    password: "secret123",
    ...overrides,
    profile: { displayName: `e2e ${tag}`, ...overrides.profile },
  };
}

/**
 * Signs up a new member and checks the 201. Returns the body that was sent,
 * for logging in with, and the user that came back.
 *
 * A test that expects another status posts signUpBody() itself.
 */
export async function signUp(
  app: INestApplication<App>,
  overrides: Partial<SignUpBody> = {},
): Promise<{ sent: SignUpBody; user: SignedUpUser }> {
  const sent = signUpBody(overrides);
  const response = await request(app.getHttpServer()).post("/auth/sign-up").send(sent).expect(201);
  return { sent, user: response.body as SignedUpUser };
}
