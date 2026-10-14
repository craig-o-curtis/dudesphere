import { MigrationInterface, QueryRunner } from "typeorm";

// Stops a hard delete of a user from taking that user's refresh tokens with
// it.
//
// The rows of "refresh_token" are now kept after their session ends, for 180
// days, as a record of what the session did. The foreign key to "user" was
// ON DELETE CASCADE, so deleting a user row deleted every one of those rows
// in the same statement, and the record with them.
//
// ON DELETE RESTRICT turns that round: Postgres refuses to delete a user row
// while the user still has rows in "refresh_token". Whatever removes a user
// for real has to remove the token rows first, on purpose.
//
// The app is not affected. It never hard deletes a user: closing an account
// is a soft delete, which sets "deletedAt" and fires no foreign key. The e2e
// cleanup is the one thing that does, and it now deletes the token rows
// before the users.
//
// Postgres cannot change the delete rule of a foreign key in place, so the
// constraint is dropped and added back under the same name. No row changes.
//
// down() puts ON DELETE CASCADE back.
export class RestrictUserDeleteWithRefreshTokens1791896833273 implements MigrationInterface {
  name = "RestrictUserDeleteWithRefreshTokens1791896833273";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_token" DROP CONSTRAINT "FK_8e913e288156c133999341156ad"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_token" ADD CONSTRAINT "FK_8e913e288156c133999341156ad" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_token" DROP CONSTRAINT "FK_8e913e288156c133999341156ad"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_token" ADD CONSTRAINT "FK_8e913e288156c133999341156ad" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }
}
