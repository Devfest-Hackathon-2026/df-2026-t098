import { MigrationInterface, QueryRunner } from 'typeorm';

export class GuestAnswerImport1794420000000 implements MigrationInterface {
  name = 'GuestAnswerImport1794420000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE learning_operations DROP CONSTRAINT learning_operations_kind_check;
      ALTER TABLE learning_operations ADD CONSTRAINT learning_operations_kind_check
        CHECK (kind IN ('feed','attempt','publish','followup','guest_import'));
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM learning_operations WHERE kind = 'guest_import';
      ALTER TABLE learning_operations DROP CONSTRAINT learning_operations_kind_check;
      ALTER TABLE learning_operations ADD CONSTRAINT learning_operations_kind_check
        CHECK (kind IN ('feed','attempt','publish','followup'));
    `);
  }
}
