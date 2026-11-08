import { MigrationInterface, QueryRunner } from 'typeorm';

export class LearningEngine1794000000000 implements MigrationInterface {
  name = 'LearningEngine1794000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE learning_preferences (
        user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        preferences jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE learning_questions (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        title varchar(160) NOT NULL,
        prompt text NOT NULL,
        code text,
        code_language varchar(60),
        topics text[] NOT NULL,
        difficulty varchar(20) NOT NULL CHECK (difficulty IN ('beginner','intermediate','advanced')),
        language varchar(2) NOT NULL CHECK (language IN ('ja','en')),
        source varchar(20) NOT NULL CHECK (source IN ('ai','community')),
        author_id uuid REFERENCES users(id) ON DELETE SET NULL,
        generated_for uuid REFERENCES users(id) ON DELETE SET NULL,
        reference_answer text NOT NULL,
        rubric jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX learning_questions_feed ON learning_questions (language, source, created_at DESC);
      CREATE INDEX learning_questions_topics ON learning_questions USING GIN (topics);
      CREATE INDEX learning_questions_generated_for ON learning_questions (generated_for, created_at DESC);
      CREATE TABLE learning_operations (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind varchar(20) NOT NULL CHECK (kind IN ('feed','attempt','publish')),
        scope_id uuid REFERENCES learning_questions(id) ON DELETE CASCADE,
        fingerprint varchar(64) NOT NULL,
        status varchar(20) NOT NULL CHECK (status IN ('pending','complete','failed')),
        lease uuid NOT NULL,
        expires_at timestamptz NOT NULL,
        called_at timestamptz NOT NULL DEFAULT now(),
        call_count integer NOT NULL DEFAULT 1,
        result jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX learning_operations_user ON learning_operations (user_id, kind, created_at DESC);
      CREATE TABLE learning_attempts (
        id uuid PRIMARY KEY REFERENCES learning_operations(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        question_id uuid NOT NULL REFERENCES learning_questions(id) ON DELETE CASCADE,
        answer text NOT NULL,
        score integer NOT NULL CHECK (score BETWEEN 0 AND 10),
        feedback text NOT NULL,
        improvements jsonb NOT NULL,
        explanation text NOT NULL,
        xp_awarded integer NOT NULL CHECK (xp_awarded BETWEEN 0 AND 20),
        day date NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX learning_attempts_user_day ON learning_attempts (user_id, day, question_id);
      CREATE INDEX learning_attempts_ranking ON learning_attempts (day, user_id) WHERE xp_awarded > 0;
      CREATE TABLE learning_question_progress (
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        question_id uuid NOT NULL REFERENCES learning_questions(id) ON DELETE CASCADE,
        attempt_count integer NOT NULL DEFAULT 0,
        last_score integer NOT NULL DEFAULT 0 CHECK (last_score BETWEEN 0 AND 10),
        passed boolean NOT NULL DEFAULT false,
        needs_review boolean NOT NULL DEFAULT false,
        xp_earned integer NOT NULL DEFAULT 0 CHECK (xp_earned BETWEEN 0 AND 20),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, question_id)
      );
      CREATE INDEX learning_question_reviews ON learning_question_progress (user_id, updated_at DESC) WHERE needs_review;
      CREATE TABLE learning_reactions (
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        question_id uuid NOT NULL REFERENCES learning_questions(id) ON DELETE CASCADE,
        liked boolean NOT NULL DEFAULT false,
        saved boolean NOT NULL DEFAULT false,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, question_id)
      );
      CREATE INDEX learning_reactions_likes ON learning_reactions (question_id) WHERE liked;
      CREATE TABLE learning_comments (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        question_id uuid NOT NULL REFERENCES learning_questions(id) ON DELETE CASCADE,
        text text NOT NULL CHECK (length(text) BETWEEN 1 AND 1000),
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX learning_comments_question ON learning_comments (question_id, created_at DESC);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE learning_comments;
      DROP TABLE learning_reactions;
      DROP TABLE learning_question_progress;
      DROP TABLE learning_attempts;
      DROP TABLE learning_operations;
      DROP TABLE learning_questions;
      DROP TABLE learning_preferences;
    `);
  }
}
