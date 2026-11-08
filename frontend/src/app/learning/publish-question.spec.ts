import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { PublishQuestion } from './publish-question';
import { AuthSession } from '../auth/auth-session';
import { LearningApi, LearningError } from './learning-api';

describe('Community question publication', () => {
  const send = vi.fn();
  beforeEach(() => {
    send.mockReset();
    TestBed.configureTestingModule({
      imports: [PublishQuestion],
      providers: [
        provideRouter([]),
        {
          provide: AuthSession,
          useValue: { user: signal({ id: 'author' }), status: signal('authenticated') },
        },
        { provide: LearningApi, useValue: { send } },
      ],
    });
  });

  it('retains a publication ID and the form across a retryable provider failure', async () => {
    send.mockRejectedValueOnce(new LearningError(503, 'AI_UNAVAILABLE')).mockResolvedValueOnce({
      question: { id: 'published', prompt: 'Why is a signed token useful?' },
    });
    const fixture = TestBed.createComponent(PublishQuestion);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    for (const [id, value] of [
      ['question-title', 'A signed token'],
      ['question-prompt', 'Why is a signed token useful?'],
      ['question-reference', 'A signature detects whether the claims were altered.'],
    ]) {
      const input = root.querySelector<HTMLInputElement | HTMLTextAreaElement>('#' + id)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
    root
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    const requestId = send.mock.calls[0][2].requestId;
    expect(root.querySelector<HTMLInputElement>('#question-title')?.value).toBe('A signed token');
    root
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(send.mock.calls[1][2].requestId).toBe(requestId);
    expect(root.textContent).toContain('質問を公開しました');
  });

  it.each([
    {
      code: 'console.log(1);',
      language: '',
      message: 'コードの言語を入力してください。',
      invalidField: '#question-code-language',
    },
    {
      code: '',
      language: 'JavaScript',
      message: 'コードを入力するか、コードの言語を空欄にしてください。',
      invalidField: '#question-code',
    },
  ])(
    'validates the optional code/language pair locally and preserves the draft ($invalidField)',
    async ({ code, language, message, invalidField }) => {
      const fixture = TestBed.createComponent(PublishQuestion);
      await fixture.whenStable();
      const root = fixture.nativeElement as HTMLElement;
      const fields = [
        ['question-title', 'A signed token'],
        ['question-prompt', 'Why is a signed token useful?'],
        ['question-reference', 'A signature detects whether the claims were altered.'],
        ['question-code', code],
        ['question-code-language', language],
      ];
      for (const [id, value] of fields) {
        const input = root.querySelector<HTMLInputElement | HTMLTextAreaElement>('#' + id)!;
        input.value = value;
        input.dispatchEvent(new Event('input'));
      }
      root
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await fixture.whenStable();
      expect(send).not.toHaveBeenCalled();
      expect(root.querySelector('#question-code-error')?.textContent).toContain(message);
      expect(root.querySelector<HTMLDetailsElement>('details')?.open).toBe(true);
      expect(root.querySelector(invalidField)?.getAttribute('aria-invalid')).toBe('true');
      for (const [id, value] of fields)
        expect(root.querySelector<HTMLInputElement | HTMLTextAreaElement>('#' + id)?.value).toBe(
          value,
        );
    },
  );
});
