import {
  normalizeConcept,
  questionNovelty,
  selectNovelQuestions,
  similarQuestions,
} from './question-novelty';

const first = {
  prompt:
    'Why does a secure website use HTTPS instead of HTTP when handling personal user data? Choose the best explanation.',
  code: null,
};
const second = {
  prompt:
    'Why should a website use HTTPS instead of standard HTTP when transmitting personal data? Choose the best reason and explain why.',
  code: null,
};

describe('Fresh-question novelty', () => {
  it('rejects the reported HTTPS paraphrase', () => {
    expect(similarQuestions(first, second)).toBe(true);
  });

  it.each([
    'Why should a website use HTTPS instead of plain HTTP when users send private data? Select the best reason and explain why.',
    'Why should a login page send data over HTTPS instead of unencrypted HTTP? Select the best reason and explain why.',
  ])('matches an existing pool paraphrase: %s', (prompt) => {
    expect(similarQuestions(first, { prompt })).toBe(true);
    expect(similarQuestions(second, { prompt })).toBe(true);
  });

  it('keeps a different question about the same HTTPS topic', () => {
    expect(
      similarQuestions(first, {
        prompt:
          'How does a browser check a server certificate to authenticate its identity?',
        code: null,
      }),
    ).toBe(false);
  });

  it('preserves distinct named cookie flags in otherwise matching prompts', () => {
    const prompt =
      'Why should a session cookie use the FLAG attribute when storing a session identifier?';
    expect(
      similarQuestions(
        { prompt: prompt.replace('FLAG', 'Secure') },
        { prompt: prompt.replace('FLAG', 'HttpOnly') },
      ),
    ).toBe(false);
    expect(
      similarQuestions(
        { prompt: prompt.replace('FLAG', 'Secure') },
        {
          prompt:
            'Why use Secure on a session cookie that stores a session identifier?',
        },
      ),
    ).toBe(true);
  });

  it('matches close Japanese paraphrases with normalized public terms', () => {
    expect(
      similarQuestions(
        {
          prompt:
            '個人情報を送信するとき、HTTPではなくHTTPSを使うのはなぜですか？最も適切な説明を選んでください。',
        },
        {
          prompt:
            '個人データを送るとき、標準のHTTPではなくHTTPSを利用する理由を説明してください。',
        },
      ),
    ).toBe(true);
  });

  it('keeps different code examples even under an identical generic prompt', () => {
    expect(
      similarQuestions(
        { prompt: 'What does this code print?', code: 'console.log(1);' },
        {
          prompt: 'What does this code print?',
          code: 'console.log(2);',
        },
      ),
    ).toBe(false);
  });

  it('allows a different task on the same code', () => {
    expect(
      similarQuestions(
        { prompt: 'What does this code print?', code: 'console.log(1);' },
        {
          prompt: 'Why does console.log write this number to the terminal?',
          code: 'console.log(1);',
        },
      ),
    ).toBe(false);
  });

  it('keeps identical source with different programming-language semantics', () => {
    const question = {
      prompt: 'What does this code print?',
      code: 'print(1 / 2)',
    };
    expect(
      similarQuestions(
        { ...question, codeLanguage: 'Python' },
        { ...question, codeLanguage: 'Ruby' },
      ),
    ).toBe(false);
    expect(
      similarQuestions(
        { ...question, codeLanguage: ' Python ' },
        { ...question, codeLanguage: 'python' },
      ),
    ).toBe(true);
  });

  it('preserves exact duplicates and bounds public hints', () => {
    expect(
      similarQuestions(first, { ...first, prompt: first.prompt.toUpperCase() }),
    ).toBe(true);
    expect(questionNovelty(first)).toMatchObject({ version: 1, codeKey: null });
    expect(questionNovelty(first).exact).toMatch(/^[a-f0-9]{64}$/);
    expect(
      questionNovelty({ prompt: 'word '.repeat(1000) }).tokens.length,
    ).toBeLessThanOrEqual(120);
  });

  it('filters against previous and newly selected questions', () => {
    const distinct = {
      prompt: 'Why should passwords be stored with a slow password hash?',
      code: null,
    };
    expect(selectNovelQuestions([first, second, distinct], [], 5)).toEqual([
      first,
      distinct,
    ]);
    expect(selectNovelQuestions([second, distinct], [first], 5)).toEqual([
      distinct,
    ]);
  });

  it('treats a shared concept as a repeat even when the wording is unrelated', () => {
    expect(
      similarQuestions(
        {
          prompt: 'Why can one site not read cookies set by another site?',
          concept: 'same-origin-policy',
        },
        {
          prompt: 'True or false: browsers enforce the SOP to isolate origins.',
          concept: 'Same Origin Policy',
        },
      ),
    ).toBe(true);
    expect(
      similarQuestions(
        {
          prompt: 'What does a JWT signature prove?',
          concept: 'jwt-signature',
        },
        { prompt: 'What does a JWT signature prove?', concept: 'jwt-expiry' },
      ),
    ).toBe(true);
    expect(normalizeConcept('日本語のみ')).toBeNull();
    expect(
      questionNovelty({ prompt: 'x', concept: 'HTTPS  encryption' }).concept,
    ).toBe('https-encryption');
  });
});
