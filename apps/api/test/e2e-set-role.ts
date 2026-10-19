// Sets the role of one e2e user, so the web Playwright suite can sign in as
// an admin (WEB-11).
//
// No route can make an admin, by design. So the suite signs a user up the
// usual way, then runs `pnpm --filter @dudesphere/api e2e:set-role` (see
// test/e2e-set-role-cli.ts) to change that one row, the way it runs
// `e2e:cleanup`. apps/web never touches a database itself.
//
// It refuses, before it opens a connection:
// - an email that isn't an e2e user's, so a real member or the seeded admin
//   can never be changed. The e2e cleanup deletes these users after each run,
//   so a role set here never outlives the run;
// - a role that isn't in UserRole;
// - a database that isn't on this machine (see test/local-databases.ts).
//
// This file does not load .env. The CLI does that first, with
// `import "dotenv/config"`, so the unit spec can import this file without
// reading the developer's .env.
import { DataSource } from "typeorm";

import { UserRole } from "../src/users/user.entity.js";
import { assertLocalDatabases } from "./local-databases.js";

// The shape every e2e suite gives its users: `e2e-` plus 12 lower-case hex
// characters, at example.com. The web suite makes the tag with
// randomBytes(6).toString("hex") (apps/web/e2e/auth.spec.ts).
export const E2E_USER_EMAIL = /^e2e-[0-9a-f]{12}@example\.com$/;
// The app's own default (src/config/env.validate.ts), as in e2e-cleanup.ts.
// An unset or empty MONGO_URI is valid there, so it has to work here too.
const DEFAULT_MONGO_URI = "mongodb://localhost:27017/dude-abidings";

const ROLES: readonly string[] = Object.values(UserRole);

function isUserRole(role: string): role is UserRole {
  return ROLES.includes(role);
}

/**
 * Sets `role` on the user with `email`, and prints one line saying so.
 *
 * Throws, and changes nothing, when the email isn't an e2e user's, the role
 * isn't in UserRole, a database isn't on this machine, or no user has the
 * email.
 */
export async function setE2eRole(email: string, role: string): Promise<void> {
  if (!E2E_USER_EMAIL.test(email)) {
    throw new Error(
      `e2e:set-role only changes e2e- users, with an email of e2e- plus 12 lower-case ` +
        `hex characters at example.com. Not one: "${email}".`,
    );
  }
  if (!isUserRole(role)) {
    throw new Error(`"${role}" is not a role. Use one of: ${ROLES.join(", ")}.`);
  }
  assertLocalDatabases(
    process.env.PG_HOST ?? "localhost",
    process.env.MONGO_URI || DEFAULT_MONGO_URI,
  );

  // Not src/database/data-source.ts: that one lists the *.entity.ts files by
  // glob, and this file runs in plain Node, where TypeORM cannot load them.
  // Raw SQL needs no entities, so this source registers none.
  const dataSource = new DataSource({
    type: "postgres",
    host: process.env.PG_HOST ?? "localhost",
    port: Number(process.env.PG_PORT ?? 5432),
    username: process.env.PG_ADMIN_USER,
    password: process.env.PG_ADMIN_PW,
    database: process.env.PG_DATABASE,
  });
  await dataSource.initialize();

  try {
    // A raw UPDATE returns [rows, count] from the Postgres driver. The email
    // column is citext, and the pattern above only lets lower case through.
    const [, count] = (await dataSource.query(`UPDATE "user" SET "role" = $1 WHERE "email" = $2`, [
      role,
      email,
    ])) as [unknown, number];
    if (count === 0) {
      throw new Error(`No user has the email ${email}. Sign the user up first.`);
    }
  } finally {
    await dataSource.destroy();
  }

  console.log(`[e2e set-role] ${email} is now ${role}`);
}
