import { MigrationInterface, QueryRunner } from 'typeorm';

const before =
  '300 is above the IPv4 octet maximum of 255. The comparison returns false and correctly rejects that input.';
const after =
  "Position 4. octet4 is '300', above the maximum of 255 for an IPv4 octet (each one must be 0 to 255). The other three (192, 168 and 1) are valid, so the fourth is the odd one out. The check octet4 <= 255 returns false, which correctly rejects the address; it only tests octet4, so a full validator would check all four.";

/**
 * The first learners to miss this question were told only that 300 is too big, never why the
 * answer is position 4 or that their own pick was valid. Guarded, so an edited row is left alone.
 */
export class ClarifyIPv4OctetExplanation1794410000000 implements MigrationInterface {
  name = 'ClarifyIPv4OctetExplanation1794410000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.replace(queryRunner, before, after);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await this.replace(queryRunner, after, before);
  }

  private async replace(queryRunner: QueryRunner, from: string, to: string): Promise<void> {
    await queryRunner.query(
      `UPDATE learning_questions
       SET quick_explanation = $1
       WHERE id = '48a72346-5684-4d6d-b79d-502bb9579f67' AND quick_explanation = $2`,
      [to, from],
    );
  }
}
