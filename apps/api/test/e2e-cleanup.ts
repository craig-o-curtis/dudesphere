// Finds what the e2e runs write to the dev databases, and deletes it or
// counts it.
//
// Three callers share this file:
// - test/global-setup.ts, before and after each API e2e run;
// - test/e2e-cleanup-cli.ts, behind `pnpm e2e:cleanup` and `pnpm e2e:check`;
// - the web Playwright suite, which runs `pnpm e2e:cleanup` before and after
//   its own run (apps/web/e2e/global-setup.ts), so that apps/web never
//   touches a database itself.
//
// Every e2e run creates its users with an e2e- email and username, and its
// hashtags as e2e plus 12 hex characters (see unusedSlug in
// hashtags.e2e-spec.ts). Those shapes are the contract this file relies on: a
// run that creates rows under another name leaves them behind.
//
// The seeded admin and any real dev data do not match the shapes, so this
// never touches them.
//
// This file does not load .env. Each entry point does that first, with
// `import "dotenv/config"`, so the unit spec can import this file without
// reading the developer's .env.
import { mongo } from "mongoose";
import { DataSource } from "typeorm";

import { assertLocalDatabases } from "./local-databases.js";

const E2E_EMAIL = "e2e-%@example.com";
// The whole slug, not just its start. A slug cannot hold a hyphen, so there is
// no e2e- prefix to lean on, and /^e2e/ alone would also delete a real tag
// such as #e2etesting.
export const E2E_SLUG = /^e2e[0-9a-f]{12}$/;
// The app's own default (src/config/env.validate.ts). An unset or empty
// MONGO_URI is valid there, so it has to work here too.
const DEFAULT_MONGO_URI = "mongodb://localhost:27017/dude-abidings";

/** A Mongo collection the cleanup covers, and how to find its e2e documents. */
interface MongoTarget {
  store: "mongo";
  name: string;
  /** Its key in E2eCounts. */
  key: string;
  /** What the log lines call its rows. */
  label: string;
  /** Finds its e2e documents, given the ids of the e2e users. */
  filter: (ids: number[]) => mongo.Filter<mongo.Document>;
}

/** A Postgres table the cleanup covers, and how to find its e2e rows. */
interface PostgresTarget {
  store: "postgres";
  name: string;
  /** Its key in E2eCounts. */
  key: string;
  /** What the log lines call its rows. */
  label: string;
  /** The column that holds the user id. */
  column: string;
  /**
   * The type of that column. The tables of @nestjs/authentication hold the id
   * as text, so they are searched with the ids as strings.
   */
  idsAs: "int" | "text";
}

// Every table and collection the cleanup covers, in the order it deletes them.
// The cleanup and `pnpm e2e:check` both read this one list, and
// e2e-cleanup.spec.ts fails if the migrations or the Mongoose schemas name a
// table or collection that is not on it.
//
// Every row is found through the ids of the e2e users (see e2eUserIds), except
// hashtags, which are found by their slug.
//
// The order matters:
// - Mongo before Postgres. The abidings are keyed by userId, and the user rows
//   are the only place those ids can be read from. If the users went first and
//   Mongo then failed, no later run could find the abidings. This way round, a
//   failure leaves the users in place for the next run.
// - The user last. The profile's foreign key points at the user. The tables
//   of @nestjs/authentication hold the user id as text with no foreign key,
//   so nothing would remove their rows with the user, and they would pile up
//   run after run.
//
// These are real DELETEs: the app only ever soft-deletes, so this is the one
// place rows are removed, and it only removes rows matching the e2e shapes.
export const E2E_TARGETS = [
  {
    store: "mongo",
    name: "abidings",
    key: "abidings",
    label: "abidings",
    filter: (ids: number[]) => ({ userId: { $in: ids } }),
  },
  {
    store: "mongo",
    name: "hashtags",
    key: "hashtags",
    label: "hashtags",
    filter: () => ({ slug: E2E_SLUG }),
  },
  {
    store: "postgres",
    name: "profile",
    key: "profiles",
    label: "profiles",
    column: "userId",
    idsAs: "int",
  },
  {
    store: "postgres",
    name: "refresh_tokens",
    key: "refreshTokens",
    label: "refresh tokens",
    column: "user_id",
    idsAs: "text",
  },
  {
    store: "postgres",
    name: "email_tokens",
    key: "emailTokens",
    label: "email tokens",
    column: "user_id",
    idsAs: "text",
  },
  {
    store: "postgres",
    name: "sessions",
    key: "sessions",
    label: "sessions",
    column: "user_id",
    idsAs: "text",
  },
  {
    store: "postgres",
    name: "user",
    key: "users",
    label: "users",
    column: "id",
    idsAs: "int",
  },
] as const satisfies readonly (MongoTarget | PostgresTarget)[];

type E2eTarget = (typeof E2E_TARGETS)[number];

/** How many e2e rows each table and collection holds, or how many went. */
export type E2eCounts = Record<E2eTarget["key"], number>;

/** "2 abidings, 0 hashtags, ...": one count for each target, in E2E_TARGETS order. */
export function formatCounts(counts: E2eCounts): string {
  return E2E_TARGETS.map((target) => `${counts[target.key]} ${target.label}`).join(", ");
}

/** What `pnpm e2e:check` prints, and whether the databases are clean. */
export interface E2eCheckReport {
  clean: boolean;
  lines: string[];
}

/** Turns the counts into the lines `pnpm e2e:check` prints. */
export function describeCheck(counts: E2eCounts): E2eCheckReport {
  const total = Object.values<number>(counts).reduce((sum, count) => sum + count, 0);
  const found = `[e2e check] found ${formatCounts(counts)}`;
  if (total === 0) {
    return { clean: true, lines: [found, "[e2e check] clean: no e2e rows are left"] };
  }
  return {
    clean: false,
    lines: [
      found,
      `[e2e check] ${total} e2e rows are left. Run \`pnpm e2e:cleanup\` to remove them.`,
    ],
  };
}

/**
 * Opens both databases, runs `work`, and closes them again.
 *
 * The guard runs before any connection is opened. The cleanup runs ahead of
 * the first suite, so throwing here also stops the suites from writing
 * anything.
 */
async function withDatabases<T>(
  work: (dataSource: DataSource, db: mongo.Db) => Promise<T>,
): Promise<T> {
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
  // || and not ??: an empty MONGO_URI counts as unset, as it does in the app.
  // directConnection: talk to the one host the guard checked, and never
  // follow a replica set's member list to another one.
  const client = new mongo.MongoClient(process.env.MONGO_URI || DEFAULT_MONGO_URI, {
    directConnection: true,
  });
  await dataSource.initialize();

  try {
    await client.connect();
    return await work(dataSource, client.db());
  } finally {
    await Promise.all([dataSource.destroy(), client.close()]);
  }
}

/** The ids of every e2e user. Every target but hashtags is searched by these. */
async function e2eUserIds(dataSource: DataSource): Promise<number[]> {
  const found = (await dataSource.query(`SELECT id FROM "user" WHERE email LIKE $1`, [
    E2E_EMAIL,
  ])) as { id: number }[];
  return found.map((row) => row.id);
}

/** The WHERE clause and its one parameter, for a Postgres target. */
function e2eRowsOf(
  target: PostgresTarget,
  ids: number[],
): { where: string; params: [number[] | string[]] } {
  return {
    where: `"${target.column}" = ANY($1::${target.idsAs}[])`,
    params: [target.idsAs === "text" ? ids.map(String) : ids],
  };
}

/** Runs `work` on each target in turn, in E2E_TARGETS order, and collects the numbers. */
async function forEachTarget(work: (target: E2eTarget) => Promise<number>): Promise<E2eCounts> {
  const counts: Partial<E2eCounts> = {};
  for (const target of E2E_TARGETS) {
    counts[target.key] = await work(target);
  }
  return counts as E2eCounts;
}

/** Deletes every e2e row, and prints one line saying how many went. */
export async function cleanupE2eData(label: string): Promise<void> {
  await withDatabases(async function deleteE2eRows(dataSource, db) {
    const ids = await e2eUserIds(dataSource);

    const removed = await forEachTarget(async function deleteFrom(target) {
      if (target.store === "mongo") {
        const result = await db.collection(target.name).deleteMany(target.filter(ids));
        return result.deletedCount;
      }
      const { where, params } = e2eRowsOf(target, ids);
      // A raw DELETE returns [rows, count] from the Postgres driver.
      const [, count] = (await dataSource.query(
        `DELETE FROM "${target.name}" WHERE ${where}`,
        params,
      )) as [unknown, number];
      return count;
    });

    console.log(`[e2e ${label}] removed ${formatCounts(removed)}`);
  });
}

/** Counts the e2e rows in every table and collection the cleanup covers. Deletes nothing. */
export async function countE2eData(): Promise<E2eCounts> {
  return withDatabases(async function countE2eRows(dataSource, db) {
    const ids = await e2eUserIds(dataSource);

    return forEachTarget(async function countIn(target) {
      if (target.store === "mongo") {
        return db.collection(target.name).countDocuments(target.filter(ids));
      }
      const { where, params } = e2eRowsOf(target, ids);
      // count(*) comes back from the Postgres driver as a string.
      const [row] = (await dataSource.query(
        `SELECT count(*) FROM "${target.name}" WHERE ${where}`,
        params,
      )) as { count: string }[];
      return Number(row.count);
    });
  });
}
