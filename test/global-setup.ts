// Cleans up what the e2e suites write to the dev databases.
//
// vitest runs setup() once before any e2e file and teardown() once after the
// last one. Both call the same cleanup, so a run starts from a clean slate even
// if the previous run was killed, and ends with nothing left behind.
//
// Every e2e suite creates its users with an e2e- email and username, and its
// hashtags as e2e plus 12 hex characters (see unusedSlug in
// hashtags.e2e-spec.ts). Those shapes are the contract this file relies on: a
// suite that creates rows under another name leaves them behind.
//
// The seeded admin and any real dev data do not match the shapes, so this
// never touches them.
import "dotenv/config";
import { mongo } from "mongoose";
import { DataSource } from "typeorm";

const E2E_EMAIL = "e2e-%@example.com";
// The whole slug, not just its start. A slug cannot hold a hyphen, so there is
// no e2e- prefix to lean on, and /^e2e/ alone would also delete a real tag
// such as #e2etesting.
const E2E_SLUG = /^e2e[0-9a-f]{12}$/;
// The app's own default (src/config/env.validate.ts). An unset or empty
// MONGO_URI is valid there, so it has to work here too.
const DEFAULT_MONGO_URI = "mongodb://localhost:27017/dude-abidings";

async function cleanup(label: string): Promise<void> {
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
  const client = new mongo.MongoClient(process.env.MONGO_URI || DEFAULT_MONGO_URI);
  await dataSource.initialize();

  try {
    const found = (await dataSource.query(`SELECT id FROM "user" WHERE email LIKE $1`, [
      E2E_EMAIL,
    ])) as { id: number }[];
    const ids = found.map((row) => row.id);

    // Mongo before Postgres. The abidings are keyed by userId, and the user
    // rows are the only place those ids can be read from. If the users went
    // first and Mongo then failed, no later run could find the abidings. This
    // way round, a failure here leaves the users in place for the next run.
    await client.connect();
    const db = client.db();
    const abidings = await db.collection("abidings").deleteMany({ userId: { $in: ids } });
    const hashtags = await db.collection("hashtags").deleteMany({ slug: E2E_SLUG });

    // The profile first, because its foreign key points at the user. These are
    // real DELETEs: the app only ever soft-deletes, so this is the one place
    // rows are removed, and it only removes rows matching the e2e prefix.
    // A raw DELETE returns [rows, count] from the Postgres driver.
    const [, profiles] = (await dataSource.query(
      `DELETE FROM profile WHERE "userId" = ANY($1::int[])`,
      [ids],
    )) as [unknown, number];
    const [, users] = (await dataSource.query(`DELETE FROM "user" WHERE id = ANY($1::int[])`, [
      ids,
    ])) as [unknown, number];

    console.log(
      `[e2e ${label}] removed ${users} users, ${profiles} profiles, ` +
        `${abidings.deletedCount} abidings, ${hashtags.deletedCount} hashtags`,
    );
  } finally {
    await Promise.all([dataSource.destroy(), client.close()]);
  }
}

export async function setup(): Promise<void> {
  await cleanup("before");
}

export async function teardown(): Promise<void> {
  await cleanup("after");
}
