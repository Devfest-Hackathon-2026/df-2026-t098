import { MigrationInterface, QueryRunner } from 'typeorm';

export class SocialLearningCommunity1794200000000 implements MigrationInterface {
  name = 'SocialLearningCommunity1794200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE learning_comments
        DROP CONSTRAINT learning_comments_text_check,
        ADD COLUMN kind varchar(20) NOT NULL DEFAULT 'comment'
          CHECK (kind IN ('comment','explanation','question','correction')),
        ADD COLUMN parent_id uuid REFERENCES learning_comments(id) ON DELETE CASCADE,
        ADD COLUMN client_request_id uuid,
        ADD COLUMN deleted_at timestamptz,
        ADD CONSTRAINT learning_comments_text_check CHECK (
          (deleted_at IS NOT NULL AND text = '') OR
          (deleted_at IS NULL AND length(text) BETWEEN 1 AND
            CASE WHEN kind = 'explanation' THEN 5000 ELSE 1000 END)
        );
      CREATE UNIQUE INDEX learning_comments_request
        ON learning_comments (user_id,client_request_id) WHERE client_request_id IS NOT NULL;
      CREATE INDEX learning_comments_parent ON learning_comments(parent_id);
      CREATE TABLE learning_comment_helpful (
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        comment_id uuid NOT NULL REFERENCES learning_comments(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id,comment_id)
      );
      CREATE TABLE learning_question_reports (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        question_id uuid NOT NULL REFERENCES learning_questions(id) ON DELETE CASCADE,
        reason varchar(20) NOT NULL CHECK (reason IN ('incorrect','unclear','outdated')),
        details text NOT NULL DEFAULT '',
        status varchar(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX learning_question_reports_open
        ON learning_question_reports(user_id,question_id,reason) WHERE status = 'open';
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE learning_question_reports;
      DROP TABLE learning_comment_helpful;
      DROP INDEX learning_comments_request;
      DROP INDEX learning_comments_parent;
      ALTER TABLE learning_comments DROP CONSTRAINT learning_comments_text_check,
        DROP COLUMN deleted_at, DROP COLUMN client_request_id,
        DROP COLUMN parent_id, DROP COLUMN kind;
      -- Preserve existing long contributions/tombstones while constraining future legacy writes.
      ALTER TABLE learning_comments ADD CONSTRAINT learning_comments_text_check
        CHECK (length(text) BETWEEN 1 AND 1000) NOT VALID;
    `);
  }
}
