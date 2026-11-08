import { MigrationInterface, QueryRunner } from 'typeorm';

export class QuestionConcepts1794300000000 implements MigrationInterface {
  name = 'QuestionConcepts1794300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE learning_questions ADD COLUMN concept varchar(80)
        CHECK (concept ~ '^[a-z0-9]+(-[a-z0-9]+){0,7}$');
      CREATE INDEX learning_questions_concept ON learning_questions (language, concept)
        WHERE concept IS NOT NULL;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX learning_questions_concept;
      ALTER TABLE learning_questions DROP COLUMN concept;
    `);
  }
}
