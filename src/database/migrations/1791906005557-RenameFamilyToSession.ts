import { MigrationInterface, QueryRunner } from "typeorm";

// Renames two columns of "refresh_token", so the table uses the same word as
// the rest of the code:
//
//   "familyId"        becomes "sessionId"
//   "familyExpiresAt" becomes "sessionExpiresAt"
//
// The refresh tokens of one login were called a "family", and one login was
// also called a "session". They are the same thing, so only "session" is
// kept.
//
// Written by hand. `pnpm migration:generate` does not know a rename from a
// removal: it wrote DROP COLUMN and ADD COLUMN, which would throw away every
// session id and then fail, because the new columns are NOT NULL and the
// rows would have no value for them. RENAME COLUMN keeps every row as it is.
//
// The two indexes over these columns are renamed too. TypeORM names an index
// from its table and columns, so it expects new names once the columns are
// renamed. An index follows its column through a rename by itself, so
// renaming the index is all that is left to do. Nothing is rebuilt.
//
// No member is logged out. An access token carries the session id as its
// `sid` claim, and the values do not change.
//
// down() puts the old names back.
export class RenameFamilyToSession1791906005557 implements MigrationInterface {
  name = "RenameFamilyToSession1791906005557";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "refresh_token" RENAME COLUMN "familyId" TO "sessionId"`);
    await queryRunner.query(
      `ALTER TABLE "refresh_token" RENAME COLUMN "familyExpiresAt" TO "sessionExpiresAt"`,
    );
    // ("sessionExpiresAt")
    await queryRunner.query(
      `ALTER INDEX "IDX_d3a42295870a8ef226e63f9005" RENAME TO "IDX_b1a169c280607193aaa76cf0a2"`,
    );
    // ("sessionId", "revoked")
    await queryRunner.query(
      `ALTER INDEX "IDX_ba6e194c5c121e94e34780cceb" RENAME TO "IDX_a02845349f75bb9212a3383a48"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER INDEX "IDX_a02845349f75bb9212a3383a48" RENAME TO "IDX_ba6e194c5c121e94e34780cceb"`,
    );
    await queryRunner.query(
      `ALTER INDEX "IDX_b1a169c280607193aaa76cf0a2" RENAME TO "IDX_d3a42295870a8ef226e63f9005"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_token" RENAME COLUMN "sessionExpiresAt" TO "familyExpiresAt"`,
    );
    await queryRunner.query(`ALTER TABLE "refresh_token" RENAME COLUMN "sessionId" TO "familyId"`);
  }
}
