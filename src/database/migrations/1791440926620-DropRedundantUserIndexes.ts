import { MigrationInterface, QueryRunner } from "typeorm";

// Drops the two plain indexes on "user"."username" and "user"."email".
//
// Each of those columns is also UNIQUE, and Postgres enforces a unique
// constraint with an index of its own: user_username_key and user_email_key.
// Those serve the same lookups, so the plain index beside each one was never
// needed. It only added work to every insert and update.
//
// The plain indexes came from @Index() sitting next to `unique: true` on the
// entity. Both decorators are removed in the same commit as this file, so the
// entity and the database still match.
//
// No data is touched. An index holds no data of its own, so nothing is lost
// in either direction.
//
// down() recreates both indexes as AlignSchema left them.
export class DropRedundantUserIndexes1791440926620 implements MigrationInterface {
  name = "DropRedundantUserIndexes1791440926620";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_78a916df40e02a9deb1c4b75ed"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e12875dfb3b1d92d7d7c5377e2"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_e12875dfb3b1d92d7d7c5377e2" ON "user" USING btree ("email") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_78a916df40e02a9deb1c4b75ed" ON "user" USING btree ("username") `,
    );
  }
}
