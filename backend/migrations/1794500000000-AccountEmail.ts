import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Email verification and password reset.
 *
 * `users.email_verified_at` records when an address was proven. Google accounts arrive verified
 * (Google only issues an ID token for a verified address). `auth_email_tokens` keeps only the
 * SHA-256 of each emailed token, so a database read cannot be replayed as a link.
 */
export class AccountEmail1794500000000 implements MigrationInterface {
  name = 'AccountEmail1794500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users ADD COLUMN email_verified_at timestamptz NULL;
      UPDATE users SET email_verified_at = created_at WHERE google_id IS NOT NULL;
      CREATE TABLE auth_email_tokens (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind varchar(20) NOT NULL CHECK (kind IN ('verify_email','reset_password')),
        token_hash char(64) NOT NULL UNIQUE,
        email varchar NOT NULL,
        expires_at timestamptz NOT NULL,
        used_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "IDX_auth_email_tokens_user_kind" ON auth_email_tokens (user_id, kind, created_at DESC);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE auth_email_tokens;
      ALTER TABLE users DROP COLUMN email_verified_at;
    `);
  }
}
