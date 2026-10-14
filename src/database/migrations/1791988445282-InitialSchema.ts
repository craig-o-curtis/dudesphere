import { MigrationInterface, QueryRunner } from "typeorm";

// The whole Postgres schema, from an empty database.
//
// It replaces 16 migrations, squashed on 2026-10-14 before any deploy. No
// database that had to be kept had run them: Neon was empty, CI starts from
// an empty database, and the local one could be rebuilt. The old files are
// under the git tag `pre-migration-squash`, and reference/SCHEMA_HISTORY.md
// keeps what they teach.
//
// From the first run against Neon, migrations are append-only: change the
// schema with a new migration, never by editing this one.
//
// Generated from the entities by `pnpm migration:generate`, with one line
// added by hand.

export class InitialSchema1791988445282 implements MigrationInterface {
  name = "InitialSchema1791988445282";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // EDITED BY HAND: the entities use the citext type, which is an
    // extension. An entity cannot say that, so generate leaves it out, and
    // CREATE TABLE "user" would fail without it.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS citext`);
    await queryRunner.query(`CREATE TYPE "public"."user_role_enum" AS ENUM('admin', 'user')`);
    await queryRunner.query(
      `CREATE TABLE "user" ("id" SERIAL NOT NULL, "username" citext NOT NULL, "email" citext NOT NULL, "password" character varying(255) NOT NULL, "role" "public"."user_role_enum" NOT NULL DEFAULT 'user', "passwordChangedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_78a916df40e02a9deb1c4b75edb" UNIQUE ("username"), CONSTRAINT "UQ_e12875dfb3b1d92d7d7c5377e22" UNIQUE ("email"), CONSTRAINT "CHK_user_username_characters" CHECK ("username" !~ '[[:space:]@]'), CONSTRAINT "CHK_user_email_length" CHECK (char_length("email") <= 100), CONSTRAINT "CHK_user_username_length" CHECK (char_length("username") <= 24), CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "profile" ("id" SERIAL NOT NULL, "userId" integer NOT NULL, "displayName" citext NOT NULL, "bio" text, "profileImageUrl" character varying, "isDude" boolean NOT NULL DEFAULT false, "ordainedDate" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_479d02ec9ef94c6d7e920e34875" UNIQUE ("displayName"), CONSTRAINT "REL_a24972ebd73b106250713dcddd" UNIQUE ("userId"), CONSTRAINT "CHK_profile_displayName_length" CHECK (char_length("displayName") <= 50), CONSTRAINT "PK_3dd8bfc97e4a77c70971591bdcb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "sessions" ("id" text NOT NULL, "user_id" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "last_active_at" TIMESTAMP WITH TIME ZONE NOT NULL, "mfa" text, "metadata" jsonb, CONSTRAINT "PK_3238ef96f18b355b671619111bc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "sessions_expires_at_idx" ON "sessions"  ("expires_at") `,
    );
    await queryRunner.query(`CREATE INDEX "sessions_user_id_idx" ON "sessions"  ("user_id") `);
    await queryRunner.query(
      `CREATE TABLE "refresh_tokens" ("id" text NOT NULL, "family_id" text NOT NULL, "user_id" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "family_expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "used_at" TIMESTAMP WITH TIME ZONE, "revoked" boolean NOT NULL DEFAULT false, "claims" jsonb, "sid" text, CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "refresh_tokens_family_expires_at_idx" ON "refresh_tokens"  ("family_expires_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"  ("user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "refresh_tokens_revoked_sid_idx" ON "refresh_tokens"  ("sid") WHERE "revoked"`,
    );
    await queryRunner.query(`CREATE INDEX "refresh_tokens_sid_idx" ON "refresh_tokens"  ("sid") `);
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
    await queryRunner.query(
      `ALTER TABLE "profile" ADD CONSTRAINT "FK_a24972ebd73b106250713dcddd9" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "profile" DROP CONSTRAINT "FK_a24972ebd73b106250713dcddd9"`,
    );
    await queryRunner.query(`DROP INDEX "public"."email_tokens_user_id_purpose_idx"`);
    await queryRunner.query(`DROP INDEX "public"."email_tokens_expires_at_idx"`);
    await queryRunner.query(`DROP TABLE "email_tokens"`);
    await queryRunner.query(`DROP INDEX "public"."refresh_tokens_family_id_idx"`);
    await queryRunner.query(`DROP INDEX "public"."refresh_tokens_sid_idx"`);
    await queryRunner.query(`DROP INDEX "public"."refresh_tokens_revoked_sid_idx"`);
    await queryRunner.query(`DROP INDEX "public"."refresh_tokens_user_id_idx"`);
    await queryRunner.query(`DROP INDEX "public"."refresh_tokens_family_expires_at_idx"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    await queryRunner.query(`DROP INDEX "public"."sessions_user_id_idx"`);
    await queryRunner.query(`DROP INDEX "public"."sessions_expires_at_idx"`);
    await queryRunner.query(`DROP TABLE "sessions"`);
    await queryRunner.query(`DROP TABLE "profile"`);
    await queryRunner.query(`DROP TABLE "user"`);
    await queryRunner.query(`DROP TYPE "public"."user_role_enum"`);
    // citext stays installed. Dropping it would fail if anything else in
    // the database had started to use it.
  }
}
