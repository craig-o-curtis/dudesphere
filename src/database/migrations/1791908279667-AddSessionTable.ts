import { MigrationInterface, QueryRunner } from "typeorm";

// Gives a session a row of its own.
//
// Until now a session was not a row. It was every row of "refresh_token"
// that shared a "sessionId", and each of those rows repeated the session's
// facts: whose it is, when it ends, and whether it was ended.
//
// Now there are two tables:
//
// - "session": one row for each login. It holds the member, the end, and
//   "revokedAt", the moment the session was ended on purpose.
// - "refresh_token": one row for each token, as before, pointing at its
//   session. The three repeated columns are dropped from it: "userId",
//   "sessionExpiresAt" and "revoked".
//
// Written by hand, in this order, because the generated migration could not
// run on a table that has rows. It dropped the three columns without saving
// what was in them, and it added the foreign key from "refresh_token" to an
// empty "session" table, which every existing token would break.
//
// 1. Make "session".
// 2. Fill it from the token rows, one session for each "sessionId". Every
//    row of a session carried the same member and the same end, so min()
//    and max() only pick the one value there is.
// 3. Point "refresh_token" at it, and drop what moved.
//
// The old rows said that a session was revoked, and not when. For those,
// "revokedAt" is set to the last moment the session was seen: its newest
// token being made or used. The real moment was no earlier than that.
//
// The two foreign keys:
//
// - "session"."userId" to "user": ON DELETE RESTRICT. Postgres refuses to
//   delete a user who still has sessions, as it refused for tokens before.
// - "refresh_token"."sessionId" to "session": ON DELETE CASCADE. Deleting a
//   session deletes its tokens, which is how old rows are cleared out.
//
// No member is logged out. The session ids do not change, and an access
// token carries its session id as the `sid` claim.
//
// down() puts the three columns back and fills them from "session", then
// drops the table. A revoked session keeps its "revoked" flag and loses the
// time.
export class AddSessionTable1791908279667 implements MigrationInterface {
  name = "AddSessionTable1791908279667";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. The new table.
    await queryRunner.query(
      `CREATE TABLE "session" ("id" uuid NOT NULL, "userId" integer NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "revokedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_f55da76ac1c3ac420f444d2ff11" PRIMARY KEY ("id"))`,
    );

    // 2. One session row for each session the token rows describe.
    await queryRunner.query(
      `INSERT INTO "session" ("id", "userId", "expiresAt", "revokedAt", "createdAt")
       SELECT "sessionId",
              min("userId"),
              max("sessionExpiresAt"),
              CASE WHEN bool_or("revoked") THEN GREATEST(max("createdAt"), max("usedAt")) END,
              min("createdAt")
       FROM "refresh_token"
       GROUP BY "sessionId"`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_3d2f174ef04fb312fdebd0ddc5" ON "session"  ("userId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5d97cf9773002b16861b4bb8ae" ON "session"  ("expiresAt") `,
    );
    await queryRunner.query(
      `ALTER TABLE "session" ADD CONSTRAINT "FK_3d2f174ef04fb312fdebd0ddc53" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    // 3. The token table: drop what now lives on the session, and point at it.
    await queryRunner.query(
      `ALTER TABLE "refresh_token" DROP CONSTRAINT "FK_8e913e288156c133999341156ad"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_8e913e288156c133999341156a"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_b1a169c280607193aaa76cf0a2"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_a02845349f75bb9212a3383a48"`);
    await queryRunner.query(`ALTER TABLE "refresh_token" DROP COLUMN "userId"`);
    await queryRunner.query(`ALTER TABLE "refresh_token" DROP COLUMN "sessionExpiresAt"`);
    await queryRunner.query(`ALTER TABLE "refresh_token" DROP COLUMN "revoked"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_4f310b2b1f45ec02710a719361" ON "refresh_token"  ("sessionId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_token" ADD CONSTRAINT "FK_4f310b2b1f45ec02710a7193611" FOREIGN KEY ("sessionId") REFERENCES "session"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_token" DROP CONSTRAINT "FK_4f310b2b1f45ec02710a7193611"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_4f310b2b1f45ec02710a719361"`);

    // The three columns come back empty, are filled from the session rows,
    // and only then are made NOT NULL again.
    await queryRunner.query(
      `ALTER TABLE "refresh_token" ADD "revoked" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_token" ADD "sessionExpiresAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(`ALTER TABLE "refresh_token" ADD "userId" integer`);
    await queryRunner.query(
      `UPDATE "refresh_token" AS token
       SET "userId" = session."userId",
           "sessionExpiresAt" = session."expiresAt",
           "revoked" = (session."revokedAt" IS NOT NULL)
       FROM "session" AS session
       WHERE session."id" = token."sessionId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_token" ALTER COLUMN "sessionExpiresAt" SET NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE "refresh_token" ALTER COLUMN "userId" SET NOT NULL`);

    await queryRunner.query(
      `CREATE INDEX "IDX_a02845349f75bb9212a3383a48" ON "refresh_token"  ("sessionId", "revoked") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b1a169c280607193aaa76cf0a2" ON "refresh_token"  ("sessionExpiresAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8e913e288156c133999341156a" ON "refresh_token"  ("userId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_token" ADD CONSTRAINT "FK_8e913e288156c133999341156ad" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE "session" DROP CONSTRAINT "FK_3d2f174ef04fb312fdebd0ddc53"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_5d97cf9773002b16861b4bb8ae"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_3d2f174ef04fb312fdebd0ddc5"`);
    await queryRunner.query(`DROP TABLE "session"`);
  }
}
