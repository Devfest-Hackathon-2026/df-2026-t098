import { formatQuestionCode } from './question-code';

describe('Readable question snippets', () => {
  const counter =
    'function createCounter() { let count = 0; return function() { count++; return count; }; } const counter = createCounter(); console.log(counter());';

  it('expands the reported counter into indented lines without changing the stored object', async () => {
    const original = {
      id: 'counter',
      code: counter,
      codeLanguage: 'javascript',
    };
    const result = await formatQuestionCode(original);

    expect(result.code).toBe(
      [
        'function createCounter() {',
        '  let count = 0;',
        '  return function () {',
        '    count++;',
        '    return count;',
        '  };',
        '}',
        'const counter = createCounter();',
        'console.log(counter());',
      ].join('\n'),
    );
    expect(result.id).toBe('counter');
    expect(original.code).toBe(counter);
  });

  it.each([
    [
      'TypeScript',
      'function double(value: number): number { const result = value * 2; return result; }',
    ],
    [
      'JSX',
      'export default function View() { const label = "Hello"; return <div>{label}</div>; }',
    ],
    ['CSS', '.example { color: red; padding: 16px; }'],
  ])('formats supported %s examples', async (codeLanguage, code) => {
    const result = await formatQuestionCode({ code, codeLanguage });
    expect(result.code).toContain('\n');
    expect(result.code).not.toContain('\r');
  });

  it('preserves indentation in unsupported languages', async () => {
    const original = {
      code: 'def double(value):\n    return value * 2\n',
      codeLanguage: 'python',
    };
    await expect(formatQuestionCode(original)).resolves.toBe(original);
  });

  it('keeps malformed legacy snippets available through the API', async () => {
    const original = {
      code: 'const user = { name:',
      codeLanguage: 'javascript',
    };
    await expect(formatQuestionCode(original)).resolves.toBe(original);
  });

  it('keeps questions with no code or unknown code language intact', async () => {
    const conceptual = { code: null, codeLanguage: null };
    const legacy = { code: counter, codeLanguage: null };
    await expect(formatQuestionCode(conceptual)).resolves.toBe(conceptual);
    await expect(formatQuestionCode(legacy)).resolves.toBe(legacy);
  });

  it('formats source text without executing it', async () => {
    const marker = globalThis as typeof globalThis & {
      __whylintFormatterExecuted?: boolean;
    };
    delete marker.__whylintFormatterExecuted;
    const result = await formatQuestionCode({
      code: 'globalThis.__whylintFormatterExecuted=true;',
      codeLanguage: 'js',
    });
    expect(result.code).toBe('globalThis.__whylintFormatterExecuted = true;');
    expect(marker.__whylintFormatterExecuted).toBeUndefined();
  });
});
