import { MigrationInterface, QueryRunner } from "typeorm";

// Adds the "refresh_token" table, which is what lets a member stay signed in
// and be signed out.
//
// One row for each refresh token handed out. A client swaps a refresh token
// for a new access token when the old one expires, and gets a new refresh
// token with it.
//
// - "id" is the SHA-256 hash of the token, never the token. It is the primary
//   key because a token is always looked up by its hash.
// - "familyId" is the session: every token that descends from one sign-in
//   shares it. Indexed, because a session is ended and checked by it.
// - "userId" is indexed for "sign out everywhere", and cascades, so a user
//   row that is deleted for real takes its tokens with it.
// - "expiresAt" ends this one token. "familyExpiresAt" ends the session
//   however often it was renewed, and is indexed because rows past it are
//   cleared out by it.
// - "usedAt" is set when the token is swapped. A token with a value there
//   that turns up again is being used a second time.
// - "revoked" marks a session that was ended. The rows are kept, so a token
//   saved a moment after the revocation is still covered.
//
// Nothing is backfilled. Members who are signed in when this runs have an
// access token and no refresh token, and sign in again when it expires.
//
// down() drops the table. Every member is then signed out when their access
// token expires.
export class AddRefreshToken1791737547894 implements MigrationInterface {
  name = "AddRefreshToken1791737547894";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "refresh_token" ("id" character varying(64) NOT NULL, "familyId" uuid NOT NULL, "userId" integer NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "familyExpiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "usedAt" TIMESTAMP WITH TIME ZONE, "revoked" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b575dd3c21fb0831013c909e7fe" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b803086815f2d539fe7a0349d1" ON "refresh_token"  ("familyId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8e913e288156c133999341156a" ON "refresh_token"  ("userId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d3a42295870a8ef226e63f9005" ON "refresh_token"  ("familyExpiresAt") `,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_token" ADD CONSTRAINT "FK_8e913e288156c133999341156ad" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_token" DROP CONSTRAINT "FK_8e913e288156c133999341156ad"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_d3a42295870a8ef226e63f9005"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_8e913e288156c133999341156a"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_b803086815f2d539fe7a0349d1"`);
    await queryRunner.query(`DROP TABLE "refresh_token"`);
  }
}
