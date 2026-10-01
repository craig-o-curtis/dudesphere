import { MigrationInterface, QueryRunner } from "typeorm";

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
