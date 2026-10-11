import { MigrationInterface, QueryRunner } from "typeorm";

// EDITED BY HAND: generated, then rewritten so existing rows get a display
// name before the column becomes NOT NULL. As generated it dropped the two
// name columns first and added "displayName" NOT NULL to a table with rows,
// which fails.
//
// Gives every profile one "displayName" and drops "firstName" and "lastName".
//
// Why. A username is a login name and is no longer shown to other members.
// The display name is the one name they see, on the profile and on every
// abiding. A first and a last name were never shown anywhere and did not suit
// the app.
//
// The column is citext, so "The Dude" and "the dude" are one name, and UNIQUE
// refuses the second. The value is stored as typed. citext has no length, so
// a CHECK holds the limit of 50, the same way "user"."username" is limited.
// The citext extension is already installed, by
// CaseInsensitiveUsernameAndEmail.
//
// The backfill, in order:
//
// 1. Each row gets its first and last name joined with a space, with runs of
//    whitespace made one space, trimmed and cut to 50 characters. A result
//    shorter than 2 characters is left empty, because the DTO would not
//    accept it either.
// 2. A name of the form "Dude <digits>" is emptied. That form is kept for
//    step 4, so nothing can collide with it.
// 3. Where two rows have the same name, ignoring case, the row with the
//    lowest id keeps it and the others are emptied.
// 4. Every row still empty gets "Dude <userId>". "userId" is unique, so these
//    are too.
//
// Soft-deleted rows are backfilled like any other. The unique constraint
// covers them, as it does for usernames, so a restore can never collide.
//
// The DTO's other rules for a display name, such as no invisible characters,
// are not applied to old names. They were typed as plain names.
//
// down() brings the two columns back and puts each display name in
// "firstName". How a name was split in two is not recoverable, so "lastName"
// comes back empty. Running up() again then rebuilds the same display names.
export class ProfileDisplayName1791714615343 implements MigrationInterface {
  name = "ProfileDisplayName1791714615343";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "profile" ADD "displayName" citext`);

    await queryRunner.query(`
      UPDATE "profile" AS p
      SET "displayName" = CASE WHEN char_length(joined.name) >= 2 THEN joined.name END
      FROM (
        SELECT
          "id",
          btrim(left(btrim(regexp_replace(
            concat_ws(' ', "firstName", "lastName"), '[[:space:]]+', ' ', 'g'
          )), 50)) AS name
        FROM "profile"
      ) AS joined
      WHERE joined."id" = p."id"
    `);
    await queryRunner.query(`
      UPDATE "profile" SET "displayName" = NULL WHERE "displayName" ~* '^dude [0-9]+$'
    `);
    await queryRunner.query(`
      UPDATE "profile" AS p
      SET "displayName" = NULL
      WHERE EXISTS (
        SELECT 1 FROM "profile" AS earlier
        WHERE earlier."displayName" = p."displayName" AND earlier."id" < p."id"
      )
    `);
    await queryRunner.query(`
      UPDATE "profile" SET "displayName" = 'Dude ' || "userId" WHERE "displayName" IS NULL
    `);

    await queryRunner.query(`ALTER TABLE "profile" ALTER COLUMN "displayName" SET NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "profile" ADD CONSTRAINT "UQ_479d02ec9ef94c6d7e920e34875" UNIQUE ("displayName")`,
    );
    await queryRunner.query(
      `ALTER TABLE "profile" ADD CONSTRAINT "CHK_profile_displayName_length" CHECK (char_length("displayName") <= 50)`,
    );
    await queryRunner.query(`ALTER TABLE "profile" DROP COLUMN "firstName"`);
    await queryRunner.query(`ALTER TABLE "profile" DROP COLUMN "lastName"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "profile" ADD "lastName" character varying(100)`);
    await queryRunner.query(`ALTER TABLE "profile" ADD "firstName" character varying(100)`);
    await queryRunner.query(`UPDATE "profile" SET "firstName" = "displayName"`);
    await queryRunner.query(
      `ALTER TABLE "profile" DROP CONSTRAINT "CHK_profile_displayName_length"`,
    );
    await queryRunner.query(
      `ALTER TABLE "profile" DROP CONSTRAINT "UQ_479d02ec9ef94c6d7e920e34875"`,
    );
    await queryRunner.query(`ALTER TABLE "profile" DROP COLUMN "displayName"`);
  }
}
