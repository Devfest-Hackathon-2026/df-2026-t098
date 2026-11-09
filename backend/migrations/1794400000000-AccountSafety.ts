import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Store-policy support for user-generated content:
 * - comment reports (Apple guideline 1.2: report objectionable content),
 * - per-user blocks (hide a blocked user's comments and published questions),
 * - an `inappropriate` reason for question reports.
 *
 * Both new tables cascade from `users`, so deleting an account (DELETE /auth/me)
 * removes the reports the user filed and the blocks they created or received.
 */
export class AccountSafety1794400000000 implements MigrationInterface {
  name = 'AccountSafety1794400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE learning_question_reports
        DROP CONSTRAINT learning_question_reports_reason_check,
        ADD CONSTRAINT learning_question_reports_reason_check
          CHECK (reason IN ('incorrect','unclear','outdated','inappropriate'));
      CREATE TABLE learning_comment_reports (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        comment_id uuid NOT NULL REFERENCES learning_comments(id) ON DELETE CASCADE,
        reason varchar(20) NOT NULL
          CHECK (reason IN ('spam','harassment','inappropriate','other')),
        details text NOT NULL DEFAULT '',
        status varchar(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX learning_comment_reports_open
        ON learning_comment_reports(user_id,comment_id,reason) WHERE status = 'open';
      CREATE INDEX learning_comment_reports_comment ON learning_comment_reports(comment_id);
      CREATE TABLE learning_user_blocks (
        blocker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (blocker_id,blocked_id),
        CHECK (blocker_id <> blocked_id)
      );
      CREATE INDEX learning_user_blocks_blocked ON learning_user_blocks(blocked_id);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Question reports filed with the new reason cannot satisfy the old constraint.
    await queryRunner.query(`
      DROP TABLE learning_user_blocks;
      DROP TABLE learning_comment_reports;
      DELETE FROM learning_question_reports WHERE reason = 'inappropriate';
      ALTER TABLE learning_question_reports
        DROP CONSTRAINT learning_question_reports_reason_check,
        ADD CONSTRAINT learning_question_reports_reason_check
          CHECK (reason IN ('incorrect','unclear','outdated'));
    `);
  }
}
