import { MigrationInterface, QueryRunner } from "typeorm";

// Lets a profile be soft-deleted together with its user.
//
// 1. Adds a nullable "deletedAt" column to "profile". Null means the profile
//    is live. Once it is set, TypeORM leaves the row out of every find(),
//    which is what the @SoftDeleteUtcColumn on the entity relies on.
//
// 2. Backfills it. Users could already be soft-deleted before this ran, and
//    their profiles would have stayed visible. Each of those profiles gets its
//    user's "deletedAt", so it is hidden from the same moment the user was.
//    Profiles of live users are left as null.
//
// From here on the app keeps the two in step itself: UsersService.deleteUser
// and restoreUser set and clear both in one transaction.
//
// down() drops the column, and the timestamps in it. Running up() again fills
// them back in from "user".
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
