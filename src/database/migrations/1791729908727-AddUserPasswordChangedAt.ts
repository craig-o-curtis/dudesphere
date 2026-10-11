import { MigrationInterface, QueryRunner } from "typeorm";

// Lets a password change end the login tokens that are already out.
//
// Adds a nullable "passwordChangedAt" column to "user". It holds the moment
// the password was last changed or reset. UsersService.updateUser sets it,
// and JwtAuthGuard, through UsersService.getUserForToken, refuses a token
// signed before it.
//
// No backfill. Null means the password has not changed since this ran, so
// every token that is out today stays good, and nobody is signed out by the
// deploy.
//
// timestamptz, like every other timestamp in the app. See
// TimestampsWithTimeZone.
//
// down() drops the column. Tokens signed before a password change then work
// again until they expire.
export class AddUserPasswordChangedAt1791729908727 implements MigrationInterface {
  name = "AddUserPasswordChangedAt1791729908727";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" ADD "passwordChangedAt" TIMESTAMP WITH TIME ZONE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "passwordChangedAt"`);
  }
}
