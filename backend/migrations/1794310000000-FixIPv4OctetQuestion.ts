import { MigrationInterface, QueryRunner } from 'typeorm';

const original = {
  title: 'Invalid Character in IPv4 Address',
  prompt: 'Which line contains an invalid character that causes this IPv4 address check to fail? Select the buggy line number and explain why.',
  referenceAnswer: 'Line 4 contains the bug because an IPv4 address octet cannot exceed the value of 255.',
  rubric: [
    'Identifies line 4 as containing an out-of-range value.',
    'Explains that IPv4 address octets only range from 0 to 255.',
  ],
  format: 'spot_bug',
  quickExplanation: 'Each number in an IPv4 address must be between 0 and 255, so 300 is invalid.',
};

const corrected = {
  title: 'IPv4 Octet Range',
  prompt: 'Which octet is outside the valid IPv4 range? Choose its position from left to right.',
  referenceAnswer: 'An IPv4 octet must be between 0 and 255. The fourth octet is 300, so the comparison with 255 returns false as expected. A full validator would check both bounds on all four octets.',
  rubric: [
    'Identifies 300 as the out-of-range input.',
    'Explains the 0 to 255 octet range and why the check returns false.',
  ],
  format: 'choice',
  quickExplanation: '300 is above the IPv4 octet maximum of 255. The comparison returns false and correctly rejects that input.',
};

export class FixIPv4OctetQuestion1794310000000 implements MigrationInterface {
  name = 'FixIPv4OctetQuestion1794310000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.replace(queryRunner, original.prompt, corrected);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await this.replace(queryRunner, corrected.prompt, original);
  }

  private async replace(
    queryRunner: QueryRunner,
    previousPrompt: string,
    question: typeof original,
  ): Promise<void> {
    await queryRunner.query(
      `UPDATE learning_questions
       SET title = $1, prompt = $2, reference_answer = $3, rubric = $4::jsonb,
           format = $5, quick_explanation = $6
       WHERE id = '48a72346-5684-4d6d-b79d-502bb9579f67'
         AND source = 'ai' AND generated_for IS NULL AND prompt = $7 AND correct_option = 3
         AND options = '["1","2","3","4"]'::jsonb`,
      [
        question.title,
        question.prompt,
        question.referenceAnswer,
        JSON.stringify(question.rubric),
        question.format,
        question.quickExplanation,
        previousPrompt,
      ],
    );
  }
}
