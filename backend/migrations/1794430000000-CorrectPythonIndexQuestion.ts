import { MigrationInterface, QueryRunner } from 'typeorm';

const before =
  'Which line causes an IndexError when trying to print the first item? Select the buggy line number and explain how list indices start.';
const after =
  'Which line makes this code print the second item instead of the first? Tap the buggy line and explain how Python list indices start.';

export class CorrectPythonIndexQuestion1794430000000 implements MigrationInterface {
  name = 'CorrectPythonIndexQuestion1794430000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.replace(queryRunner, before, after);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await this.replace(queryRunner, after, before);
  }

  private async replace(queryRunner: QueryRunner, from: string, to: string): Promise<void> {
    await queryRunner.query(
      `UPDATE learning_questions SET prompt = $1
       WHERE id = 'eff5dc29-46a1-49a1-bce4-cf8154a96db7'
         AND generated_for IS NULL AND source = 'ai' AND prompt = $2`,
      [to, from],
    );
  }
}
