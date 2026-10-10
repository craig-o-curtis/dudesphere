import { MigrationInterface, QueryRunner } from "typeorm";

// Makes the database match the entities exactly, so `pnpm migration:check`
// reports no differences. It adds no table and no column. CreateInitialSchema
// was written by hand, and this closes the two gaps between what it built and
// what user.entity.ts and profile.entity.ts declare.
//
// 1. "user"."role" changes from plain text to a Postgres enum,
//    user_role_enum ('admin', 'user'), matching the UserRole enum on the
//    entity. The column is converted in place, so every user keeps their role.
//    The conversion fails if any row holds a value other than those two.
//
// 2. The two indexes on "user" and the foreign key on "profile" are dropped
//    and recreated under the names TypeORM derives for them. They cover the
//    same columns and behave the same as before; only the names change.
//    migration:check compares names, so the readable ones counted as drift.
//
// down() reverses both: the role goes back to plain text with its values kept,
// and the indexes and the key get their original names back.
export class AlignSchema1790767195266 implements MigrationInterface {
  name = "AlignSchema1790767195266";

  // Here we are dropping the foreign key and the two indexes, then creating
  // them again at the end under new names. They were not incorrect. They
  // cover the same columns and do the same job before and after. Only the
  // names change:
  //   FK_profile_userId  ->  FK_a24972ebd73b106250713dcddd9
  //   IDX_user_username  ->  IDX_78a916df40e02a9deb1c4b75ed
  //   IDX_user_email     ->  IDX_e12875dfb3b1d92d7d7c5377e2
  //
  // The first migration was written by hand and gave them readable names.
  // TypeORM works out its own name for each one, a hash of the table and
  // column names, and `pnpm migration:check` compares names. So it reported
  // three differences on a schema that worked.
  //
  // What the first migration did get wrong was "role": plain text, where the
  // entity declares an enum. The middle of this function fixes that.
  //
  // Neither is fixed by editing the first migration. A database that has run
  // a migration never runs it again, so a change there would reach new
  // databases and miss every existing one. A fix goes in a new migration,
  // which every database runs once.
  //
  // It is drop and create, not a rename, because that is what TypeORM
  // generates. The drops come first and the creates last for the same
  // reason. Nothing in between depends on them.
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "profile" DROP CONSTRAINT "FK_profile_userId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_user_username"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_user_email"`);
    // EDITED BY HAND: TypeORM generated DROP COLUMN + ADD COLUMN here, which would
    // wipe every user's role. Converting the column in place keeps the data.
    await queryRunner.query(`CREATE TYPE "public"."user_role_enum" AS ENUM('admin', 'user')`);
    await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "role" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "role" TYPE "public"."user_role_enum" USING "role"::"public"."user_role_enum"`,
    );
    await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'user'`);
    await queryRunner.query(
      `CREATE INDEX "IDX_78a916df40e02a9deb1c4b75ed" ON "user"  ("username") `,
    );
    await queryRunner.query(`CREATE INDEX "IDX_e12875dfb3b1d92d7d7c5377e2" ON "user"  ("email") `);
    await queryRunner.query(
      `ALTER TABLE "profile" ADD CONSTRAINT "FK_a24972ebd73b106250713dcddd9" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "profile" DROP CONSTRAINT "FK_a24972ebd73b106250713dcddd9"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_e12875dfb3b1d92d7d7c5377e2"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_78a916df40e02a9deb1c4b75ed"`);
    // EDITED BY HAND: same fix in reverse — convert back to varchar without losing roles.
    await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "role" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "role" TYPE character varying USING "role"::text`,
    );
    await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'user'`);
    await queryRunner.query(`DROP TYPE "public"."user_role_enum"`);
    await queryRunner.query(`CREATE INDEX "IDX_user_email" ON "user" USING btree ("email") `);
    await queryRunner.query(`CREATE INDEX "IDX_user_username" ON "user" USING btree ("username") `);
    await queryRunner.query(
      `ALTER TABLE "profile" ADD CONSTRAINT "FK_profile_userId" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }
}
