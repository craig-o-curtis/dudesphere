import { MigrationInterface, QueryRunner } from "typeorm";

// A partial index on refresh_tokens.sid that holds only revoked rows.
//
// SignInsRepository.isLive runs on every signed-in request. It asks whether
// any row of the sign-in is revoked. With only refresh_tokens_sid_idx that
// meant reading every row of the sign-in, and a sign-in gains one on every
// refresh. This index holds none of a sign-in still going, so the answer
// comes at once.
//
// Generated, not edited. down() drops the index; no data changes.

export class RevokedSignInIndex1791979584968 implements MigrationInterface {
  name = "RevokedSignInIndex1791979584968";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "refresh_tokens_revoked_sid_idx" ON "refresh_tokens"  ("sid") WHERE "revoked"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."refresh_tokens_revoked_sid_idx"`);
  }
}
