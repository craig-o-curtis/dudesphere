import { MigrationInterface, QueryRunner } from "typeorm";

// Gives every sign-in an id of its own, `sid`, so an access token can be
// tied to its sign-in and refused once the sign-in ends.
//
// TokensController now passes a random UUID as the `sid` claim when a member
// signs in. The package stores the claims with the family and signs them
// into every access token of it. TypeOrmAuthenticationStore copies `sid` out
// of the claims into this column, and JwtAuth checks it on every request
// through SignInsRepository.isLive.
//
// Families from before this migration have no `sid`. Each one gets a new
// UUID, written both to the column and into its `claims`. So a member who
// signed in before it refreshes into access tokens that carry a `sid`, and
// stays signed in. Only the access token they hold right now, which has no
// `sid`, is refused, once, and the client refreshes as it does on any 401.
//
// The id is a new UUID, not the family id: the package makes family ids as
// 22 random characters, and JwtAuth accepts only a UUID as a `sid`.
//
// down() drops the column and the index, and takes `sid` out of `claims`.
export class SessionIdOnRefreshTokens1791967006363 implements MigrationInterface {
  name = "SessionIdOnRefreshTokens1791967006363";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD "sid" text`);
    await queryRunner.query(`CREATE INDEX "refresh_tokens_sid_idx" ON "refresh_tokens"  ("sid") `);

    // One new UUID for each family, the same on every row of it.
    await queryRunner.query(`
      WITH family AS (
        SELECT family_id, gen_random_uuid()::text AS sid
        FROM refresh_tokens
        GROUP BY family_id
      )
      UPDATE refresh_tokens AS token
      SET sid = family.sid,
          claims = coalesce(token.claims, '{}'::jsonb) || jsonb_build_object('sid', family.sid)
      FROM family
      WHERE token.family_id = family.family_id
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE refresh_tokens SET claims = claims - 'sid' WHERE claims ? 'sid'`,
    );
    await queryRunner.query(`DROP INDEX "public"."refresh_tokens_sid_idx"`);
    await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP COLUMN "sid"`);
  }
}
