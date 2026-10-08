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
    await queryRunner.query(`
      ALTER TABLE "profile"
      ADD CONSTRAINT "FK_profile_userId"
      FOREIGN KEY ("userId") REFERENCES "user"("id")
      ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "profile" DROP CONSTRAINT "FK_profile_userId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "profile"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user"`);
  }
}
