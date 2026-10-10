import { MigrationInterface, QueryRunner } from "typeorm";

// Makes "user"."username" and "user"."email" ignore letter case, and stops a
// username from holding "@" or whitespace.
//
// Why. Login now takes a username or an email in one field. The service tells
// them apart by the "@": with one it searches email, without one it searches
// username. That is only safe when no username can contain "@". Otherwise
// someone registers another person's email address as their username, and a
// login for that address matches two accounts.
//
// Case. Both columns were varchar, so "Walter" and "walter" were two different
// accounts, and "Walter@X.com" could not log in as "walter@x.com". citext is
// text that compares without regard to case. The UNIQUE constraint on each
// column then refuses a second value that differs only by case, and every
// `WHERE email = $1` matches any casing, with no change to a query. The value
// is stored as typed, so a username still shows the casing its owner chose.
//
// Length. citext has no length of its own, so two CHECK constraints keep the
// limits the varchar columns had. char_length counts characters, the same way
// varchar(24) did and the same way @MaxCodePoints does in the DTO.
//
// Whitespace. Login trims the identifier, so a username must not start or end
// with a space. The DTO refuses whitespace anywhere in one, and so does the
// third CHECK.
//
// The data is converted in place. up() first counts the rows that would break
// a rule and stops with a message if there are any, before it changes a thing.
//
// down() goes back to varchar and drops the three checks. It leaves the citext
// extension installed: dropping it would fail if anything else had started to
// use it.
export class CaseInsensitiveUsernameAndEmail1791652758485 implements MigrationInterface {
  name = "CaseInsensitiveUsernameAndEmail1791652758485";

  // Each query counts the rows that break one rule. The label is what the
  // error says when the count is not zero.
  private static readonly blockers: [label: string, sql: string][] = [
    [
      "usernames that contain @ or whitespace",
      `SELECT count(*)::int AS count FROM "user" WHERE "username" ~ '[[:space:]@]'`,
    ],
    [
      "usernames that differ from another only by case",
      `SELECT coalesce(sum(n), 0)::int AS count FROM (SELECT count(*) AS n FROM "user" GROUP BY lower("username") HAVING count(*) > 1) AS clashes`,
    ],
    [
      "emails that differ from another only by case",
      `SELECT coalesce(sum(n), 0)::int AS count FROM (SELECT count(*) AS n FROM "user" GROUP BY lower("email") HAVING count(*) > 1) AS clashes`,
    ],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    const found: string[] = [];
    for (const [label, sql] of CaseInsensitiveUsernameAndEmail1791652758485.blockers) {
      const [{ count }] = (await queryRunner.query(sql)) as [{ count: number }];
      if (count > 0) {
        found.push(`${count} ${label}`);
      }
    }
    if (found.length > 0) {
      throw new Error(
        `Cannot make username and email case-insensitive. Fix these rows first, soft-deleted ones included: ${found.join("; ")}.`,
      );
    }

    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS citext`);
    await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "username" TYPE citext`);
    await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "email" TYPE citext`);
    await queryRunner.query(
      `ALTER TABLE "user" ADD CONSTRAINT "CHK_user_username_length" CHECK (char_length("username") <= 24)`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD CONSTRAINT "CHK_user_email_length" CHECK (char_length("email") <= 100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD CONSTRAINT "CHK_user_username_characters" CHECK ("username" !~ '[[:space:]@]')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP CONSTRAINT "CHK_user_username_characters"`);
    await queryRunner.query(`ALTER TABLE "user" DROP CONSTRAINT "CHK_user_email_length"`);
    await queryRunner.query(`ALTER TABLE "user" DROP CONSTRAINT "CHK_user_username_length"`);
    await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "email" TYPE varchar(100)`);
    await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "username" TYPE varchar(24)`);
  }
}
