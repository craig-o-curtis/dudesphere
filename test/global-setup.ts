// Cleans up what the e2e suites write to the dev databases.
//
// vitest runs setup() once before any e2e file and teardown() once after the
// last one. Both call the same cleanup, so a run starts from a clean slate even
// if the previous run was killed, and ends with nothing left behind.
//
// Every e2e suite creates its users with an e2e- email and username, and its
// hashtags with an e2e slug (see unusedSlug in hashtags.e2e-spec.ts). Those
// prefixes are the contract this file relies on: a suite that creates rows
// under another name leaves them behind.
//
// The seeded admin and any real dev data do not match the prefixes, so this
// never touches them.
import "dotenv/config";
import { mongo } from "mongoose";
import { DataSource } from "typeorm";

const E2E_EMAIL = "e2e-%@example.com";
const E2E_SLUG = /^e2e/;

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
  const client = new mongo.MongoClient(process.env.MONGO_URI ?? "");
  await dataSource.initialize();

  try {
    // The ids first: the Mongo abidings are keyed by userId, so they have to
    // be found before the users go.
    const found = (await dataSource.query(`SELECT id FROM "user" WHERE email LIKE $1`, [
      E2E_EMAIL,
    ])) as { id: number }[];
    const ids = found.map((row) => row.id);

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

    await client.connect();
    const db = client.db();
    const abidings = await db.collection("abidings").deleteMany({ userId: { $in: ids } });
    const hashtags = await db.collection("hashtags").deleteMany({ slug: E2E_SLUG });

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
