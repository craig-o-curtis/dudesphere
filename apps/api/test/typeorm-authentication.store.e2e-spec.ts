import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { AuthenticationStorage } from "@nestjs/authentication";
import { authenticationStoreContract } from "@nestjs/authentication/testing";
import { DataSource } from "typeorm";

import devDataSource from "./../src/database/data-source.js";
import { TypeOrmAuthenticationStore } from "./../src/typeorm/typeorm-authentication.store.js";

// TypeOrmAuthenticationStore against the package's own contract suite, from
// @nestjs/authentication/testing, as "Keep sessions and tokens in your
// database" on https://docs.nestjs.com/security/authentication tests its
// store. `concurrent: true` adds the races: parallel refreshes of one token,
// parallel uses of one link, a sign-out racing a request. A store that reads a
// row and then writes it passes the other cases and fails these.
//
// Only the three contracts the app uses: sessions, refresh tokens and email
// links.
//
// The suite needs empty tables, so it runs on a throwaway database on the dev
// server, made from the migrations, and dropped at the end. The dev database
// is not touched.

/** The store with a cap of 3 pending links, so the suite can check the cap. */
class CappedStore extends TypeOrmAuthenticationStore {
  protected override readonly maxPending = 3;
}

const TEST_DATABASE = "dude_auth_store_contract";

// The entity and migration classes, imported here, the way test/routes.ts
// imports the controllers. The dev data source finds them by file glob,
// which makes TypeORM load the .ts files itself, outside vitest, and fail on
// their TypeScript.
const SRC = fileURLToPath(new URL("../src/", import.meta.url));

async function classesIn(pattern: RegExp): Promise<Function[]> {
  const files = readdirSync(SRC, { recursive: true, encoding: "utf8" }).filter((file) =>
    pattern.test(file),
  );
  const modules = await Promise.all(
    files.map(
      async (file) =>
        (await import(pathToFileURL(join(SRC, file)).href)) as Record<string, unknown>,
    ),
  );
  return modules.flatMap((module) =>
    Object.values(module).filter((value): value is Function => typeof value === "function"),
  );
}
const entities = await classesIn(/\.entit(y|ies)\.ts$/);
const migrations = await classesIn(/^database\/migrations\/[^/]+\.ts$/);

describe("TypeOrmAuthenticationStore (contract)", () => {
  let server: DataSource;
  let dataSource: DataSource;

  beforeAll(async () => {
    // The dev server's own maintenance database, to make and drop the
    // throwaway one from.
    server = await new DataSource({
      ...devDataSource.options,
      database: "postgres",
      entities: [],
      migrations: [],
    } as typeof devDataSource.options).initialize();
    await server.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE}`);
    await server.query(`CREATE DATABASE ${TEST_DATABASE}`);

    // A pool of ten, so the concurrency cases race for real.
    dataSource = await new DataSource({
      ...devDataSource.options,
      database: TEST_DATABASE,
      entities,
      migrations,
      poolSize: 10,
    } as typeof devDataSource.options).initialize();
    await dataSource.runMigrations();
  });

  afterAll(async () => {
    await dataSource?.destroy();
    await server?.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE}`);
    await server?.destroy();
  });

  /** The store on empty tables, registered nowhere: the suite builds its own registry. */
  async function emptyStore() {
    await dataSource.query("TRUNCATE sessions, refresh_tokens, email_tokens");
    const store = new CappedStore(dataSource, new AuthenticationStorage());
    return { sessions: store, refreshTokens: store, emailTokens: store };
  }

  for (const contractCase of authenticationStoreContract(emptyStore, {
    contracts: ["sessions", "refreshTokens", "emailTokens"],
    concurrent: true,
    maxPending: 3,
  })) {
    it(contractCase.name, () => contractCase.run());
  }
});
