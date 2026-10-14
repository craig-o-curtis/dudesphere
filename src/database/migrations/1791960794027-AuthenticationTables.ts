import { MigrationInterface, QueryRunner } from "typeorm";

// Moves sign-in state to the tables of @nestjs/authentication.
//
// Until now the app kept its own: "session" (one row for each sign-in),
// "refresh_token" (one row for each token, pointing at its session) and
// "password_reset_token". The package keeps the same facts in the shape the
// NestJS docs give, in src/typeorm/authentication.entities.ts:
//
// - "refresh_tokens": one row for each token. The tokens of one sign-in
//   share a "family_id", and each row repeats the family's member, its end
//   ("family_expires_at") and whether it was ended ("revoked").
// - "email_tokens": password reset links, and later email verification
//   links, told apart by "purpose".
// - "sessions": browser sessions with a cookie. Nothing writes here yet, so
//   it starts empty.
//
// The generated migration only made the new tables. The copy and the drops
// are written by hand, so that no member is signed out and no reset link
// stops working:
//
// 1. Make the three tables.
// 2. Copy every refresh token. The family is the old session: its id, its
//    member, its end, and "revoked" when the session was ended. The old
//    "revokedAt" time is lost; the package records only that it was.
// 3. Copy every reset link, with the member's email, and the fingerprint the
//    package checks: the link works only while the password hash it was
//    sent for is still the member's.
// 4. Drop the old tables.
//
// Both kinds of token are 32 random bytes, written as 43 base64url
// characters, and both are stored as their SHA-256. The old tables wrote that
// digest in hex, and the package writes it in base64url, so each id is
// converted. A token a member holds then finds its row as before.
//
// "user_id" is text with no foreign key, as in the docs. See
// authentication.entities.ts.
//
// down() makes the old tables again, with their old names, keys and indexes,
// and copies back what it can: a family whose id is a uuid, which is every
// family made before this migration. Sign-ins made after it are lost, and
// their members sign in again. Reset links are not copied back.

// SHA-256 in base64url without padding, from the same digest in hex.
const HEX_TO_BASE64URL = (column: string) =>
  `rtrim(translate(encode(decode(${column}, 'hex'), 'base64'), '+/', '-_'), '=')`;

// The other way, for down(). 43 characters need one "=" to be valid base64.
const BASE64URL_TO_HEX = (column: string) =>
  `encode(decode(translate(${column}, '-_', '+/') || '=', 'base64'), 'hex')`;

export class AuthenticationTables1791960794027 implements MigrationInterface {
  name = "AuthenticationTables1791960794027";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. The new tables, as TypeORM generated them.
    await queryRunner.query(
      `CREATE TABLE "sessions" ("id" text NOT NULL, "user_id" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "last_active_at" TIMESTAMP WITH TIME ZONE NOT NULL, "mfa" text, "metadata" jsonb, CONSTRAINT "PK_3238ef96f18b355b671619111bc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "sessions_expires_at_idx" ON "sessions"  ("expires_at") `,
    );
    await queryRunner.query(`CREATE INDEX "sessions_user_id_idx" ON "sessions"  ("user_id") `);
    await queryRunner.query(
      `CREATE TABLE "refresh_tokens" ("id" text NOT NULL, "family_id" text NOT NULL, "user_id" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "family_expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "used_at" TIMESTAMP WITH TIME ZONE, "revoked" boolean NOT NULL DEFAULT false, "claims" jsonb, CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "refresh_tokens_family_expires_at_idx" ON "refresh_tokens"  ("family_expires_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"  ("user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"  ("family_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "email_tokens" ("id" text NOT NULL, "purpose" text NOT NULL, "user_id" text NOT NULL, "email" text NOT NULL, "fingerprint" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_08abb3fa348e894c274a6730d35" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "email_tokens_expires_at_idx" ON "email_tokens"  ("expires_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "email_tokens_user_id_purpose_idx" ON "email_tokens"  ("user_id", "purpose") `,
    );

    // 2. Refresh tokens, each with its old session as its family.
    await queryRunner.query(`
      INSERT INTO "refresh_tokens"
        ("id", "family_id", "user_id", "created_at", "expires_at",
         "family_expires_at", "used_at", "revoked", "claims")
      SELECT
        ${HEX_TO_BASE64URL(`rt."id"`)},
        s."id"::text,
        s."userId"::text,
        rt."createdAt",
        rt."expiresAt",
        s."expiresAt",
        rt."usedAt",
        s."revokedAt" IS NOT NULL,
        NULL
      FROM "refresh_token" rt
      JOIN "session" s ON s."id" = rt."sessionId"
    `);

    // 3. Reset links. The fingerprint is the one the package computes in
    // PasswordResetService: SHA-256, base64url, of a fixed prefix and the
    // password hash.
    await queryRunner.query(`
      INSERT INTO "email_tokens"
        ("id", "purpose", "user_id", "email", "fingerprint", "created_at", "expires_at")
      SELECT
        ${HEX_TO_BASE64URL(`prt."tokenHash"`)},
        'password-reset',
        prt."userId"::text,
        u."email",
        rtrim(translate(encode(sha256(convert_to(
          'nestjs-authentication password-reset v1 ' || u."password", 'UTF8'
        )), 'base64'), '+/', '-_'), '='),
        prt."createdAt",
        prt."expiresAt"
      FROM "password_reset_token" prt
      JOIN "user" u ON u."id" = prt."userId"
    `);

    // 4. The old tables. "refresh_token" first: it points at "session".
    await queryRunner.query(`DROP TABLE "refresh_token"`);
    await queryRunner.query(`DROP TABLE "session"`);
    await queryRunner.query(`DROP TABLE "password_reset_token"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // The old tables, as they stood before up().
    await queryRunner.query(
      `CREATE TABLE "session" ("id" uuid NOT NULL, "userId" integer NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "revokedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_f55da76ac1c3ac420f444d2ff11" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3d2f174ef04fb312fdebd0ddc5" ON "session" ("userId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5d97cf9773002b16861b4bb8ae" ON "session" ("expiresAt") `,
    );
    await queryRunner.query(
      `CREATE TABLE "refresh_token" ("id" character varying(64) NOT NULL, "sessionId" uuid NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "usedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b575dd3c21fb0831013c909e7fe" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4f310b2b1f45ec02710a719361" ON "refresh_token" ("sessionId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "password_reset_token" ("id" SERIAL NOT NULL, "userId" integer NOT NULL, "tokenHash" character varying(64) NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_324e592c57094c9dcfa00ddf919" UNIQUE ("tokenHash"), CONSTRAINT "PK_838af121380dfe3a6330e04f5bb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a4e53583f7a8ab7d01cded46a4" ON "password_reset_token" ("userId") `,
    );

    // Families whose id is a uuid, and whose member still exists: every one
    // made before up(). One session row for each family; every row of a
    // family carries the same member and end, so min() picks the one value.
    // "revokedAt" is the latest moment the family was seen, as the migration
    // before this one did.
    await queryRunner.query(`
      INSERT INTO "session" ("id", "userId", "expiresAt", "revokedAt", "createdAt")
      SELECT
        rt."family_id"::uuid,
        min(rt."user_id")::integer,
        min(rt."family_expires_at"),
        CASE WHEN bool_or(rt."revoked")
          THEN greatest(max(rt."created_at"), max(rt."used_at")) END,
        min(rt."created_at")
      FROM "refresh_tokens" rt
      WHERE rt."family_id" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND rt."user_id" ~ '^[0-9]+$'
        AND EXISTS (SELECT 1 FROM "user" u WHERE u."id"::text = rt."user_id")
      GROUP BY rt."family_id"
    `);
    await queryRunner.query(`
      INSERT INTO "refresh_token" ("id", "sessionId", "expiresAt", "usedAt", "createdAt")
      SELECT
        ${BASE64URL_TO_HEX(`rt."id"`)},
        rt."family_id"::uuid,
        rt."expires_at",
        rt."used_at",
        rt."created_at"
      FROM "refresh_tokens" rt
      JOIN "session" s ON s."id"::text = rt."family_id"
      WHERE length(rt."id") = 43
    `);

    await queryRunner.query(
      `ALTER TABLE "session" ADD CONSTRAINT "FK_3d2f174ef04fb312fdebd0ddc53" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_token" ADD CONSTRAINT "FK_4f310b2b1f45ec02710a7193611" FOREIGN KEY ("sessionId") REFERENCES "session"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "password_reset_token" ADD CONSTRAINT "FK_a4e53583f7a8ab7d01cded46a41" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(`DROP TABLE "email_tokens"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE "sessions"`);
  }
}
