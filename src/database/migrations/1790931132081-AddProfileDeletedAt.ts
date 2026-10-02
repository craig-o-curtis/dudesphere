import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProfileDeletedAt1790931132081 implements MigrationInterface {
  name = "AddProfileDeletedAt1790931132081";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "profile" ADD "deletedAt" TIMESTAMP`);
    // EDITED BY HAND: profiles of users soft-deleted before this migration
    // would otherwise stay visible.
    await queryRunner.query(`
          UPDATE "profile" p
          SET "deletedAt" = u."deletedAt"
          FROM "user" u
          WHERE p."userId" = u."id" AND u."deletedAt" IS NOT NULL
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "profile" DROP COLUMN "deletedAt"`);
  }
}
