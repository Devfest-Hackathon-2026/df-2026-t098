import { MigrationInterface, QueryRunner } from 'typeorm';

export class PasswordAuthSessions1793930000000 implements MigrationInterface {
  name = 'PasswordAuthSessions1793930000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM "users"
          GROUP BY lower(btrim("email")) HAVING count(*) > 1
        ) THEN
          RAISE EXCEPTION 'Cannot enforce unique email: existing emails collide after normalization';
        END IF;
      END $$
    `);

    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "google_id" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "users" ADD "username" character varying`);
    await queryRunner.query(`ALTER TABLE "users" ADD "password_hash" character varying`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_users_email_normalized" ON "users" (lower(btrim("email")))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_users_username_normalized" ON "users" (lower(btrim("username"))) WHERE "username" IS NOT NULL`);
    await queryRunner.query(`
      CREATE TABLE "sessions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "revoked_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sessions_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM "users" WHERE "google_id" IS NULL) THEN
          RAISE EXCEPTION 'Cannot roll back: password-only users exist';
        END IF;
        IF EXISTS (SELECT 1 FROM "users" WHERE "username" IS NOT NULL OR "password_hash" IS NOT NULL) THEN
          RAISE EXCEPTION 'Cannot roll back: user password or username data exists';
        END IF;
        IF EXISTS (SELECT 1 FROM "sessions") THEN
          RAISE EXCEPTION 'Cannot roll back: session records exist';
        END IF;
      END $$
    `);

    await queryRunner.query(`DROP TABLE "sessions"`);
    await queryRunner.query(`DROP INDEX "UQ_users_username_normalized"`);
    await queryRunner.query(`DROP INDEX "UQ_users_email_normalized"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "password_hash"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "username"`);
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "google_id" SET NOT NULL`);
  }
}
