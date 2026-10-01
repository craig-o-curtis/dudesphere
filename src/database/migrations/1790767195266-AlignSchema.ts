import { MigrationInterface, QueryRunner } from "typeorm";

export class AlignSchema1790767195266 implements MigrationInterface {
  name = "AlignSchema1790767195266";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "profile" DROP CONSTRAINT "FK_profile_userId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_user_username"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_user_email"`);
    // EDITED BY HAND: TypeORM generated DROP COLUMN + ADD COLUMN here, which would
    // wipe every user's role. Converting the column in place keeps the data.
    await queryRunner.query(`CREATE TYPE "public"."user_role_enum" AS ENUM('admin', 'user')`);
    await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "role" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "role" TYPE "public"."user_role_enum" USING "role"::"public"."user_role_enum"`,
    );
    await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'user'`);
    await queryRunner.query(
      `CREATE INDEX "IDX_78a916df40e02a9deb1c4b75ed" ON "user"  ("username") `,
    );
    await queryRunner.query(`CREATE INDEX "IDX_e12875dfb3b1d92d7d7c5377e2" ON "user"  ("email") `);
    await queryRunner.query(
      `ALTER TABLE "profile" ADD CONSTRAINT "FK_a24972ebd73b106250713dcddd9" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "profile" DROP CONSTRAINT "FK_a24972ebd73b106250713dcddd9"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_e12875dfb3b1d92d7d7c5377e2"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_78a916df40e02a9deb1c4b75ed"`);
    // EDITED BY HAND: same fix in reverse — convert back to varchar without losing roles.
    await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "role" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "role" TYPE character varying USING "role"::text`,
    );
    await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'user'`);
    await queryRunner.query(`DROP TYPE "public"."user_role_enum"`);
    await queryRunner.query(`CREATE INDEX "IDX_user_email" ON "user" USING btree ("email") `);
    await queryRunner.query(`CREATE INDEX "IDX_user_username" ON "user" USING btree ("username") `);
    await queryRunner.query(
      `ALTER TABLE "profile" ADD CONSTRAINT "FK_profile_userId" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }
}
