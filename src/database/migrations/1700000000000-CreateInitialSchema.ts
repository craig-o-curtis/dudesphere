import { MigrationInterface, QueryRunner } from "typeorm";

// The starting point: creates the two Postgres tables, "user" and "profile".
//
// What up() leaves behind:
//   - "user", with unique username and email, plus a plain index on each.
//     Those repeat the unique ones, and DropRedundantUserIndexes removes them.
//     "role" is plain text here, defaulting to 'user'; AlignSchema turns it
//     into an enum. "deletedAt" is the soft-delete column: the app sets it
//     rather than removing the row.
//   - "profile", with a unique "userId", so a user has at most one profile. It
//     has no "deletedAt" yet; AddProfileDeletedAt adds it.
//   - A foreign key from profile.userId to user.id with ON DELETE CASCADE, so
//     removing a user row removes its profile. The app soft-deletes, so that
//     only fires on a real DELETE.
//
// Written by hand, not generated. That is why the timestamp in the name is a
// round number, picked to sort first, and why the index and key names are
// readable ones rather than the hashes TypeORM derives. AlignSchema renames
// them.
//
// down() drops both tables, and every user and profile with them.
export class CreateInitialSchema1700000000000 implements MigrationInterface {
  name = "CreateInitialSchema1700000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create user table
    await queryRunner.query(`
      CREATE TABLE "user" (
        "id" SERIAL PRIMARY KEY NOT NULL,
        "username" varchar(24) NOT NULL UNIQUE,
        "email" varchar(100) NOT NULL UNIQUE,
        "password" varchar(255) NOT NULL,
        "role" varchar NOT NULL DEFAULT 'user',
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        "deletedAt" timestamp NULL
      )
    `);

    // Create indexes for user table
    // Indexes are sorted copies of one column that Postgres keeps beside the
    // table, each value pointing back to its row. Without one, a lookup such
    // as WHERE "email" = 'dude@example.com' reads every row to find a match.
    // With one, Postgres goes straight to the value, the way the index at the
    // back of a book sends you to a page.
    //
    // The cost is on writes. Every INSERT, and every UPDATE of that column,
    // has to keep the index in step, so an index nobody reads is pure cost.
    //
    // That is what these two are. UNIQUE on "username" and "email" above
    // already made Postgres build an index for each, because an index is how
    // it checks that a value is not taken. These repeat them, and
    // DropRedundantUserIndexes removes them.
    await queryRunner.query(`CREATE INDEX "IDX_user_username" ON "user" ("username")`);
    await queryRunner.query(`CREATE INDEX "IDX_user_email" ON "user" ("email")`);

    // Create profile table
    await queryRunner.query(`
      CREATE TABLE "profile" (
        "id" SERIAL PRIMARY KEY NOT NULL,
        "userId" int NOT NULL UNIQUE,
        "firstName" varchar(100) NULL,
        "lastName" varchar(100) NULL,
        "bio" text NULL,
        "profileImageUrl" varchar NULL,
        "isDude" boolean NOT NULL DEFAULT false,
        "ordainedDate" timestamp NULL,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `);

    // Add foreign key constraint
    // Constraints are rules the database itself enforces on every write, no
    // matter which program sends it. NOT NULL, UNIQUE and PRIMARY KEY above
    // are constraints too. A write that breaks one fails with an error, so a
    // bug in the app cannot store a row that breaks the rule.
    //
    // A foreign key is the constraint that links two tables. This one says
    // profile.userId must hold the id of a row that exists in "user":
    //   INSERT INTO profile ("userId") VALUES (999)  -> error, no user 999
    // It is added here, after both tables exist, because it names both.
    //
    // The ON DELETE CASCADE part says what happens to a profile when its user
    // row is deleted: the profile is deleted with it. The other choices are
    // to refuse the delete while a profile still points at the user, which is
    // the default, or SET NULL, which blanks the column. SET NULL could not
    // work here, because "userId" is NOT NULL.
    //
    // It only fires on a real DELETE. The app soft-deletes: it sets
    // "deletedAt" and keeps the row, so in normal use the cascade never runs.
    await queryRunner.query(`
      ALTER TABLE "profile"
      ADD CONSTRAINT "FK_profile_userId"
      FOREIGN KEY ("userId") REFERENCES "user"("id")
      ON DELETE CASCADE
    `);
  }

  // The down fn is called when someone runs `pnpm migration:revert`, and at
  // no other time. Nothing calls it on its own: not the app starting, and not
  // an up() that fails. A failed up() is undone by its transaction, not by
  // down().
  //
  // A revert undoes one migration: the newest one that has been applied.
  // TypeORM knows which that is from its "migrations" table, where it adds a
  // row for each up() it runs and removes the row again after the down().
  //
  // This migration is the oldest of five, so its down() is the last to run.
  // It takes five reverts to get here, one for each migration, newest first.
  // The CI job that checks migrations reverts once, so it tests the newest
  // down() and never reaches this one.
  //
  // down() undoes up() in reverse order. The foreign key goes first, then
  // "profile", then "user", because each depends on the one after it.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "profile" DROP CONSTRAINT "FK_profile_userId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "profile"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user"`);
  }
}
