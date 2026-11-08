import { readPoolFile } from './question-pool.seeder';

describe('Reviewed demonstration question content', () => {
  it('keeps the SQL syntax-error task and its answer aligned', () => {
    const question = readPoolFile()?.questions.find(
      (item) => item.id === '894a7456-75cf-43c8-bb51-02f6b84a6cc3',
    );

    expect(question).toBeDefined();
    expect(question!.format).toBe('spot_bug');
    expect(question!.code!.split('\n')[2]).toMatch(/^WHER\s+age\s*>=\s*20;/);
    expect(question!.options![question!.correctOption!]).toBe('3');
    expect(question!.quickExplanation).toMatch(/WHER|WHERE/);
  });
});
