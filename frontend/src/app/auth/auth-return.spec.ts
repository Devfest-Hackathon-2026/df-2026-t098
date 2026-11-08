import { questionReturnTo, saveQuestionReturn, takeQuestionReturn } from './auth-return';

const question = '/questions/894a7456-75cf-43c8-bb51-02f6b84a6cc3';

describe('Public question authentication intent', () => {
  beforeEach(() => sessionStorage.clear());

  it('accepts public question paths and a single explanation intent', () => {
    expect(questionReturnTo(question)).toBe(question);
    expect(questionReturnTo(question + '?explain=1')).toBe(question + '?explain=1');
    expect(questionReturnTo(question.toUpperCase() + '?EXPLAIN=1')).toBe(question + '?explain=1');
  });

  it.each([
    'https://evil.test/questions/894a7456-75cf-43c8-bb51-02f6b84a6cc3',
    '//evil.test',
    '/\\evil.test',
    '/questions/not-a-uuid',
    question + '/extra',
    question + '?explain=1&next=https://evil.test',
    question + '?explain=1&explain=1',
    question + '#fragment',
    '/questions/%2f%2fevil.test',
    null,
    {},
  ])('rejects an unsafe or ambiguous return target %s', (target) => {
    expect(questionReturnTo(target)).toBeNull();
  });

  it('binds an OAuth return to its attempt and consumes it once', () => {
    saveQuestionReturn(sessionStorage, 'fixture-state', question + '?explain=1');
    expect(takeQuestionReturn(sessionStorage, 'fixture-state')).toBe(question + '?explain=1');
    expect(takeQuestionReturn(sessionStorage, 'fixture-state')).toBeNull();
  });

  it('discards mismatched state and a previous intent when the next login has none', () => {
    saveQuestionReturn(sessionStorage, 'fixture-state', question);
    expect(takeQuestionReturn(sessionStorage, 'different-state')).toBeNull();
    saveQuestionReturn(sessionStorage, 'fixture-state', question);
    saveQuestionReturn(sessionStorage, 'new-state', null);
    expect(takeQuestionReturn(sessionStorage, 'fixture-state')).toBeNull();
  });
});
