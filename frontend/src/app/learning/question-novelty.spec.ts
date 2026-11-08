import { similarQuestionNovelty, validQuestionNovelty } from './question-novelty';
import type { QuestionNovelty } from './learning.types';

function hint(tokens: string[], exact = 'a', codeKey: string | null = null): QuestionNovelty {
  return { version: 1, exact: exact.repeat(64), tokens, codeKey };
}

describe('Public question novelty hints', () => {
  it('recognizes closely rephrased HTTPS concepts', () => {
    const first = hint(['https', 'http', 'encrypt', 'personal', 'data']);
    const second = hint(['https', 'http', 'encrypt', 'personal', 'data', 'transmit'], 'b');
    expect(similarQuestionNovelty(first, second)).toBe(true);
  });

  it('keeps a different task about the same broad topic', () => {
    const encryption = hint(['https', 'http', 'encrypt', 'personal', 'data']);
    const identity = hint(['https', 'tls', 'certificate', 'identity', 'verify'], 'b');
    expect(similarQuestionNovelty(encryption, identity)).toBe(false);
  });

  it('keeps questions about different named cookie protections', () => {
    const common = ['cookie', 'protect', 'session', 'browser', 'flag'];
    const secure = hint([...common, 'anchor:cookie-secure']);
    const httpOnly = hint([...common, 'anchor:cookie-httponly'], 'b');
    expect(similarQuestionNovelty(secure, httpOnly)).toBe(false);
  });

  it('keeps a named protection distinct from a question without that qualifier', () => {
    const common = ['cookie', 'protect', 'session', 'browser', 'flag'];
    expect(
      similarQuestionNovelty(hint([...common, 'anchor:cookie-secure']), hint(common, 'b')),
    ).toBe(false);
    expect(
      similarQuestionNovelty(hint(common), hint([...common, 'anchor:cookie-secure'], 'b')),
    ).toBe(false);
  });

  it('still matches paraphrases that share the same named protection', () => {
    const common = ['cookie', 'protect', 'session', 'browser', 'flag', 'anchor:cookie-secure'];
    expect(similarQuestionNovelty(hint(common), hint([...common, 'https'], 'b'))).toBe(true);
  });

  it('keeps different code examples and code-versus-concept questions', () => {
    const first = hint(['predict', 'output', 'value', 'function'], 'a', 'c'.repeat(64));
    const second = hint(first.tokens, 'a', 'd'.repeat(64));
    expect(similarQuestionNovelty(first, second)).toBe(false);
    expect(similarQuestionNovelty(first, hint(first.tokens))).toBe(false);
  });

  it('matches exact content without guessing from very short token lists', () => {
    expect(similarQuestionNovelty(hint(['http']), hint(['http']))).toBe(true);
    expect(similarQuestionNovelty(hint(['http']), hint(['http'], 'b'))).toBe(false);
  });

  it('compares normalized Japanese content tokens', () => {
    const first = hint(['暗号', '号化', '通信', '個人', '情報']);
    const second = hint(['暗号', '号化', '通信', '個人', '情報', '保護'], 'b');
    expect(similarQuestionNovelty(first, second)).toBe(true);
  });

  it('accepts v1 hints and rejects unsupported or malformed hints', () => {
    const valid = hint(['https', 'encrypt', 'data', 'privacy']);
    expect(validQuestionNovelty(valid)).toBe(true);
    expect(validQuestionNovelty(undefined)).toBe(false);
    expect(validQuestionNovelty({ ...valid, version: 2 })).toBe(false);
    expect(validQuestionNovelty({ ...valid, exact: '' })).toBe(false);
    expect(validQuestionNovelty({ ...valid, codeKey: 'unknown' })).toBe(false);
    expect(validQuestionNovelty({ ...valid, tokens: ['https', 'https'] })).toBe(false);
    expect(validQuestionNovelty({ ...valid, tokens: Array(121).fill('https') })).toBe(false);
  });

  it('treats a shared concept as a repeat even with different wording and code', () => {
    const base = {
      version: 1 as const,
      exact: 'a'.repeat(64),
      tokens: ['https', 'encrypt', 'traffic', 'password'],
      codeKey: null,
    };
    const left = { ...base, concept: 'https-encryption' };
    const right = {
      ...base,
      exact: 'b'.repeat(64),
      tokens: ['tls', 'eavesdrop', 'network', 'secure'],
      codeKey: 'c'.repeat(64),
      concept: 'https-encryption',
    };
    expect(validQuestionNovelty(left)).toBe(true);
    expect(similarQuestionNovelty(left, right)).toBe(true);
    expect(similarQuestionNovelty(left, { ...right, concept: 'tls-handshake' })).toBe(false);
    expect(validQuestionNovelty({ ...left, concept: 'Not A Key!' })).toBe(false);
  });
});
