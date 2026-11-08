import { MigrationInterface, QueryRunner } from 'typeorm';

export class TapQuizLearningLoop1794100000000 implements MigrationInterface {
  name = 'TapQuizLearningLoop1794100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE learning_questions
        ADD COLUMN format varchar(20) NOT NULL DEFAULT 'explain'
          CHECK (format IN ('explain','choice','true_false','predict_output','spot_bug')),
        ADD COLUMN options jsonb,
        ADD COLUMN correct_option smallint,
        ADD COLUMN quick_explanation text,
        ADD CONSTRAINT learning_questions_quiz CHECK (
          (format = 'explain' AND options IS NULL AND correct_option IS NULL)
          OR (format <> 'explain' AND jsonb_typeof(options) = 'array'
            AND jsonb_array_length(options) BETWEEN 2 AND 4
            AND correct_option >= 0 AND correct_option < jsonb_array_length(options)
            AND quick_explanation IS NOT NULL)
        );
      CREATE INDEX learning_questions_pool ON learning_questions (language, difficulty, created_at DESC)
        WHERE format <> 'explain';

      CREATE TABLE learning_taps (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        question_id uuid NOT NULL REFERENCES learning_questions(id) ON DELETE CASCADE,
        choice smallint NOT NULL CHECK (choice BETWEEN 0 AND 3),
        correct boolean NOT NULL,
        review boolean NOT NULL DEFAULT false,
        xp_awarded integer NOT NULL DEFAULT 0 CHECK (xp_awarded BETWEEN 0 AND 5),
        day date NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX learning_taps_first ON learning_taps (user_id, question_id) WHERE NOT review;
      CREATE INDEX learning_taps_user_time ON learning_taps (user_id, created_at DESC);
      CREATE INDEX learning_taps_question_day ON learning_taps (question_id, day, created_at);

      ALTER TABLE learning_question_progress
        ADD COLUMN box smallint NOT NULL DEFAULT 0 CHECK (box BETWEEN 0 AND 5),
        ADD COLUMN due_at timestamptz,
        ADD COLUMN last_missed_at timestamptz;
      CREATE INDEX learning_question_due ON learning_question_progress (user_id, due_at)
        WHERE due_at IS NOT NULL;

      ALTER TABLE learning_operations DROP CONSTRAINT learning_operations_kind_check;
      ALTER TABLE learning_operations ADD CONSTRAINT learning_operations_kind_check
        CHECK (kind IN ('feed','attempt','publish','followup'));

      CREATE TABLE learning_daily_challenges (
        day date NOT NULL,
        language varchar(2) NOT NULL CHECK (language IN ('ja','en')),
        question_id uuid NOT NULL REFERENCES learning_questions(id) ON DELETE CASCADE,
        PRIMARY KEY (day, language)
      );
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE learning_daily_challenges;
      DELETE FROM learning_operations WHERE kind = 'followup';
      ALTER TABLE learning_operations DROP CONSTRAINT learning_operations_kind_check;
      ALTER TABLE learning_operations ADD CONSTRAINT learning_operations_kind_check
        CHECK (kind IN ('feed','attempt','publish'));
      DROP INDEX learning_question_due;
      ALTER TABLE learning_question_progress
        DROP COLUMN last_missed_at, DROP COLUMN due_at, DROP COLUMN box;
      DROP TABLE learning_taps;
      DROP INDEX learning_questions_pool;
      ALTER TABLE learning_questions
        DROP CONSTRAINT learning_questions_quiz,
        DROP COLUMN quick_explanation, DROP COLUMN correct_option,
        DROP COLUMN options, DROP COLUMN format;
    `);
  }
}
