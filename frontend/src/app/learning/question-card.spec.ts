import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { QuestionCard } from './question-card';
import { AuthSession, AuthUser, SessionStatus } from '../auth/auth-session';
import { LearningApi, LearningError } from './learning-api';
import { ProgressStore } from './progress-store';
import type { Assessment, Question } from './learning.types';

describe('Question understanding and social actions', () => {
  beforeAll(() => {
    const show = function (this: HTMLDialogElement) {
      this.open = true;
    };
    Object.defineProperties(HTMLDialogElement.prototype, {
      show: { configurable: true, value: show },
      showModal: { configurable: true, value: show },
      close: {
        configurable: true,
        value: function (this: HTMLDialogElement) {
          this.open = false;
          this.dispatchEvent(new Event('close'));
        },
      },
    });
  });
  afterAll(() => {
    for (const method of ['show', 'showModal', 'close']) {
      Reflect.deleteProperty(HTMLDialogElement.prototype, method);
    }
  });
  const user = signal<AuthUser | null>(null);
  const status = signal<SessionStatus>('authenticated');
  const send = vi.fn();
  const get = vi.fn();
  const progressStore = { applyTap: vi.fn(), refreshAfterAssessment: vi.fn() };
  const question: Question = {
    id: 'question-1',
    title: 'JWT',
    prompt: 'Why can a JWT be verified?',
    code: null,
    codeLanguage: null,
    topics: ['general'],
    difficulty: 'beginner',
    language: 'ja',
    source: 'ai',
    author: null,
    likes: 2,
    liked: false,
    saved: false,
    createdAt: new Date().toISOString(),
    format: 'explain',
    options: null,
    tap: null,
  };
  const quiz: Question = {
    ...question,
    id: 'quiz-1',
    format: 'choice',
    options: ['The signature', 'The cookie', 'The cache'],
  };
  const tapResult = (choice: number) => ({
    questionId: quiz.id,
    choice,
    correct: choice === 0,
    correctOption: 0,
    quickExplanation: 'The signature proves the claims were not changed.',
    xpAwarded: choice === 0 ? 5 : 0,
    review: false,
    combo: choice === 0 ? 1 : 0,
    progress: null,
  });
  const assessment: Assessment = {
    id: 'attempt-1',
    questionId: question.id,
    score: 7,
    passed: false,
    feedback: 'Explain how the signature is checked.',
    improvements: ['Distinguish claims and signatures.'],
    explanation: 'A server verifies the signed claims.',
    xpAwarded: 5,
    createdAt: new Date().toISOString(),
  };

  beforeEach(() => {
    user.set({
      id: 'learner',
      email: 'learner@example.test',
      name: 'Learner',
      username: 'learner',
      avatarUrl: null,
    });
    status.set('authenticated');
    send.mockReset().mockResolvedValue(assessment);
    get.mockReset().mockResolvedValue({ comments: [] });
    TestBed.configureTestingModule({
      imports: [QuestionCard],
      providers: [
        provideRouter([]),
        { provide: AuthSession, useValue: { user, status } },
        { provide: LearningApi, useValue: { send, get } },
        { provide: ProgressStore, useValue: progressStore },
      ],
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  function compactViewport(): void {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query.includes('max-width'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  }

  async function create(value: Question = question, inputs: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(QuestionCard);
    fixture.componentRef.setInput('question', value);
    for (const [name, input] of Object.entries(inputs)) fixture.componentRef.setInput(name, input);
    await fixture.whenStable();
    return fixture;
  }
  function fill(root: HTMLElement, value: string) {
    const input = root.querySelector<HTMLTextAreaElement>('textarea')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  it('requires an explanation before asking Gemini for a score', async () => {
    const fixture = await create();
    fixture.nativeElement.querySelector('.assessment-submit').click();
    await fixture.whenStable();
    expect(send).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('あなたの考えを入力');
  });

  it('shows server-assessed understanding and offers another attempt below eight', async () => {
    const fixture = await create();
    const root = fixture.nativeElement as HTMLElement;
    fill(root, 'The server verifies the signature.');
    root.querySelector<HTMLButtonElement>('.assessment-submit')!.click();
    await fixture.whenStable();
    expect(root.querySelector('.score')?.textContent).toContain('7');
    expect(root.textContent).toContain('復習に保存しました');
    expect(root.textContent).toContain('Distinguish claims and signatures.');
    root.querySelector<HTMLButtonElement>('.assessment .retry-answer')!.click();
    await fixture.whenStable();
    expect(root.querySelector('textarea')?.value).toBe('The server verifies the signature.');
  });

  it('retries a failed assessment with the same idempotency key and preserves the draft', async () => {
    send.mockRejectedValueOnce(new LearningError(503, 'AI_UNAVAILABLE'));
    const fixture = await create();
    const root = fixture.nativeElement as HTMLElement;
    fill(root, 'The server verifies the signature.');
    root.querySelector<HTMLButtonElement>('.assessment-submit')!.click();
    await fixture.whenStable();
    const requestId = send.mock.calls[0][2].requestId;
    expect(root.querySelector('textarea')?.value).toBe('The server verifies the signature.');
    root.querySelector<HTMLButtonElement>('.assessment-submit')!.click();
    await fixture.whenStable();
    expect(send.mock.calls[1][2].requestId).toBe(requestId);
  });

  it('prevents duplicate assessment while pending and ignores its result after logout', async () => {
    let resolve!: (assessment: Assessment) => void;
    send.mockReturnValueOnce(new Promise<Assessment>((done) => (resolve = done)));
    const fixture = await create();
    const root = fixture.nativeElement as HTMLElement;
    fill(root, 'The server verifies the signature.');
    const button = root.querySelector<HTMLButtonElement>('.assessment-submit')!;
    button.click();
    fixture.detectChanges();
    button.click();
    expect(send).toHaveBeenCalledOnce();
    expect(button.disabled).toBe(true);
    user.set(null);
    status.set('guest');
    fixture.detectChanges();
    resolve(assessment);
    await fixture.whenStable();
    expect(root.querySelector('.assessment')).toBeNull();
    expect(root.querySelector('textarea')).toBeNull();
  });

  it('updates like and saved state only after the server acknowledges it', async () => {
    send.mockResolvedValueOnce({ liked: true, likes: 3 }).mockResolvedValueOnce({ saved: true });
    const fixture = await create();
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[aria-label="いいね"]')!.click();
    await fixture.whenStable();
    expect(root.querySelector('[aria-label="いいね"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelector('[aria-label="いいね"]')?.textContent).toContain('3');
    root.querySelector<HTMLButtonElement>('.save-button')!.click();
    await fixture.whenStable();
    expect(root.querySelector('.save-button')?.textContent).toContain('保存済み');
  });

  it('opens the comments panel and preserves drafts when closed', async () => {
    const fixture = await create();
    const root = fixture.nativeElement as HTMLElement;
    fill(root, 'My draft explanation.');
    const button = root.querySelector<HTMLButtonElement>('[aria-label="コメント"]')!;
    button.click();
    await fixture.whenStable();

    const panel = root.querySelector<HTMLDialogElement>('.discussion')!;
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.open).toBe(true);
    expect(document.activeElement).toBe(panel.querySelector('h2'));
    const comment = root.querySelector<HTMLTextAreaElement>('#comment-question-1')!;
    comment.value = 'My comment draft.';
    comment.dispatchEvent(new Event('input'));

    root.querySelector<HTMLButtonElement>('[aria-label="コメントを閉じる"]')!.click();
    await fixture.whenStable();
    expect(panel.open).toBe(false);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);
    expect(root.querySelector<HTMLTextAreaElement>('#answer-question-1')!.value).toBe(
      'My draft explanation.',
    );
    button.click();
    await fixture.whenStable();
    expect(comment.value).toBe('My comment draft.');
  });

  it('opens comments independently of assessment feedback after grading', async () => {
    const fixture = await create();
    const root = fixture.nativeElement as HTMLElement;
    fill(root, 'The server verifies the signature.');
    root.querySelector<HTMLButtonElement>('.assessment-submit')!.click();
    await fixture.whenStable();
    root.querySelector<HTMLButtonElement>('[aria-label="コメント"]')!.click();
    await fixture.whenStable();

    const panel = root.querySelector<HTMLDialogElement>('.discussion')!;
    expect(panel.open).toBe(true);
    expect(root.querySelector('.score')?.textContent).toContain('7');
    expect(document.activeElement).toBe(panel.querySelector('h2'));
  });

  it('keeps forward and reverse Tab within the mobile sheet', async () => {
    const fixture = await create();
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[aria-label="コメント"]')!.click();
    await fixture.whenStable();
    const panel = root.querySelector<HTMLDialogElement>('.discussion')!;
    panel.querySelector('h2')!.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    const comment = root.querySelector<HTMLTextAreaElement>('#comment-question-1')!;
    expect(document.activeElement).toBe(comment);
    comment.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(document.activeElement).toBe(panel.querySelector('[aria-label="コメントを閉じる"]'));
  });

  it('keeps a confirmed comment when reopening during a pending post', async () => {
    let resolve!: (comment: unknown) => void;
    send.mockReturnValueOnce(new Promise((done) => (resolve = done)));
    const fixture = await create();
    const root = fixture.nativeElement as HTMLElement;
    const button = root.querySelector<HTMLButtonElement>('[aria-label="コメント"]')!;
    button.click();
    await fixture.whenStable();
    const comment = root.querySelector<HTMLTextAreaElement>('#comment-question-1')!;
    comment.value = 'A useful example.';
    comment.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    root.querySelector<HTMLButtonElement>('[aria-label="コメントを投稿"]')!.click();
    fixture.detectChanges();
    expect(send).toHaveBeenCalledOnce();
    root.querySelector<HTMLButtonElement>('[aria-label="コメントを閉じる"]')!.click();
    await fixture.whenStable();
    button.click();
    await fixture.whenStable();
    expect(get).toHaveBeenCalledTimes(1);
    resolve({
      id: 'posted',
      text: 'A useful example.',
      author: { id: 'learner', displayName: 'Learner', avatarUrl: null },
      createdAt: new Date().toISOString(),
    });
    await send.mock.results[0].value;
    await fixture.whenStable();
    expect(root.querySelector('.discussion')?.textContent).toContain('A useful example.');
    expect(comment.value).toBe('');
  });

  it('renders comments as text and permits deleting only the current author’s comment', async () => {
    get.mockResolvedValueOnce({
      comments: [
        {
          id: 'own',
          text: '<script>alert(1)</script>',
          author: { id: 'learner', displayName: 'Learner', avatarUrl: null },
          createdAt: new Date().toISOString(),
        },
        {
          id: 'other',
          text: 'Helpful question',
          author: { id: 'other', displayName: 'Another learner', avatarUrl: null },
          createdAt: new Date().toISOString(),
        },
      ],
    });
    const fixture = await create();
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[aria-label="コメント"]')!.click();
    await fixture.whenStable();
    expect(root.querySelector('.discussion script')).toBeNull();
    expect(root.querySelector('.discussion')?.textContent).toContain('<script>alert(1)</script>');
    expect(root.querySelectorAll('.discussion .delete-comment')).toHaveLength(1);
  });

  describe('tap quizzes', () => {
    it('restores a completed instance tap for guest and relearning cards', async () => {
      user.set(null);
      status.set('guest');
      const cached = {
        choice: 0,
        correct: true,
        correctOption: 0,
        quickExplanation: 'Remembered.',
      };
      const fixture = await create(quiz, { relearn: true, viewId: 'relearn-1', cachedTap: cached });
      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelector('.reveal')?.textContent).toContain('Remembered.');
      expect(root.querySelectorAll('.quiz-option:disabled')).toHaveLength(3);
      expect(root.querySelector('[aria-label="コメント"]')?.getAttribute('aria-controls')).toBe(
        'discussion-relearn-1',
      );
      expect(root.querySelector('#discussion-relearn-1')).not.toBeNull();
    });

    it('grades a tap instantly, reveals the answer, and offers to explain why', async () => {
      send.mockResolvedValueOnce(tapResult(1));
      const fixture = await create(quiz);
      const root = fixture.nativeElement as HTMLElement;
      const options = root.querySelectorAll<HTMLButtonElement>('.quiz-option');
      expect(options).toHaveLength(3);
      expect(root.querySelector('textarea[id^="answer-"]')).toBeNull();
      options[1].click();
      await fixture.whenStable();
      expect(send).toHaveBeenCalledWith(
        '/questions/quiz-1/taps',
        'POST',
        { choice: 1 },
        expect.any(AbortSignal),
      );
      expect(options[0].classList).toContain('state-correct');
      expect(options[1].classList).toContain('state-wrong');
      expect(options[2].classList).toContain('state-dim');
      expect(options[0].disabled).toBe(true);
      expect(root.querySelector('.reveal')?.textContent).toContain('signature proves');
      root.querySelector<HTMLButtonElement>('.deeper-button.explain')!.click();
      await fixture.whenStable();
      expect(root.querySelector('textarea[id^="answer-"]')).not.toBeNull();
      expect(progressStore.applyTap).toHaveBeenCalled();
    });

    it('answers with number keys and shows earned XP', async () => {
      send.mockResolvedValueOnce(tapResult(0));
      const fixture = await create(quiz);
      const root = fixture.nativeElement as HTMLElement;
      root
        .querySelector('.quiz-options')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
      await fixture.whenStable();
      expect(send.mock.calls[0][2]).toEqual({ choice: 0 });
      expect(root.querySelector('.xp-float')?.textContent).toContain('+5 XP');
    });

    it('restores an earlier tap, but starts relearning cards fresh', async () => {
      const answered = {
        ...quiz,
        tap: { choice: 1, correct: false, correctOption: 0, quickExplanation: 'Because.' },
      };
      const restored = await create(answered);
      expect(restored.nativeElement.querySelector('.reveal')).not.toBeNull();
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [QuestionCard],
        providers: [
          provideRouter([]),
          { provide: AuthSession, useValue: { user, status } },
          { provide: LearningApi, useValue: { send, get } },
          { provide: ProgressStore, useValue: progressStore },
        ],
      });
      const fresh = await create(answered, { relearn: true });
      expect(fresh.nativeElement.querySelector('.reveal')).toBeNull();
      expect(fresh.nativeElement.querySelector('.reason-chip')?.textContent).toContain(
        'さっき間違えた',
      );
    });

    it('turns spot-the-bug code lines into answers', async () => {
      const bug: Question = {
        ...quiz,
        format: 'spot_bug',
        code: 'let total = 0;\nfor (const n of list)\n  total =+ n;',
        codeLanguage: 'javascript',
        options: ['2', '3'],
      };
      send.mockResolvedValueOnce({ ...tapResult(1), correctOption: 1, correct: true });
      const fixture = await create(bug);
      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelectorAll('.code-line')).toHaveLength(3);
      const lines = root.querySelectorAll<HTMLButtonElement>('button.code-line');
      expect(lines).toHaveLength(2);
      lines[1].click();
      await fixture.whenStable();
      expect(send.mock.calls[0][2]).toEqual({ choice: 1 });
      expect(lines[1].classList).toContain('state-correct');
    });

    it('asks Gemini a follow-up after answering', async () => {
      send.mockResolvedValueOnce(tapResult(0)).mockResolvedValueOnce({
        id: 'f1',
        questionId: quiz.id,
        question: 'Why not the cookie?',
        answer: 'Cookies carry tokens but do not prove integrity.',
        createdAt: new Date().toISOString(),
      });
      const fixture = await create(quiz);
      const root = fixture.nativeElement as HTMLElement;
      root.querySelector<HTMLButtonElement>('.quiz-option')!.click();
      await fixture.whenStable();
      root.querySelector<HTMLButtonElement>('.deeper-button.ask')!.click();
      await fixture.whenStable();
      const input = root.querySelector<HTMLInputElement>('.ask-form input')!;
      input.value = 'Why not the cookie?';
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();
      root.querySelector<HTMLButtonElement>('.ask-form button')!.click();
      await fixture.whenStable();
      expect(send.mock.calls[1][0]).toBe('/questions/quiz-1/follow-ups');
      expect(send.mock.calls[1][2].question).toBe('Why not the cookie?');
      expect(root.querySelector('.follow-up-answer')?.textContent).toContain(
        'do not prove integrity',
      );
    });

    it('sends guests to sign in for likes instead of disabling the button', async () => {
      user.set(null);
      status.set('guest');
      const fixture = await create(quiz);
      const like = fixture.nativeElement.querySelector('.card-actions button') as HTMLButtonElement;
      expect(like.disabled).toBe(false);
    });
  });

  it('publishes only the learner’s edited explanation and reuses its request ID after failure', async () => {
    send
      .mockResolvedValueOnce(assessment)
      .mockRejectedValueOnce(new LearningError(503, 'UNAVAILABLE'))
      .mockResolvedValueOnce({ id: 'published' });
    const fixture = await create();
    const root = fixture.nativeElement as HTMLElement;
    fill(root, 'My original explanation.');
    root.querySelector<HTMLButtonElement>('.assessment-submit')!.click();
    await fixture.whenStable();
    expect(send).toHaveBeenCalledTimes(1);
    const share = [...root.querySelectorAll<HTMLButtonElement>('.assessment button')].find(
      (button) => button.textContent?.includes('自分の説明を共有'),
    )!;
    share.click();
    await fixture.whenStable();
    const draft = root.querySelector<HTMLTextAreaElement>('.explanation-share textarea')!;
    expect(draft.value).toBe('My original explanation.');
    draft.value = 'My revised explanation, in my own words.';
    draft.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    const publish = root.querySelector<HTMLButtonElement>(
      '.explanation-share button[type="submit"]',
    )!;
    publish.click();
    await fixture.whenStable();
    expect(draft.value).toBe('My revised explanation, in my own words.');
    const payload = send.mock.calls[1][2];
    expect(payload).toEqual({
      text: draft.value,
      kind: 'explanation',
      requestId: expect.any(String),
    });
    expect(payload).not.toHaveProperty('feedback');
    publish.click();
    await fixture.whenStable();
    expect(send.mock.calls[2][2]).toEqual(payload);
    expect(root.textContent).toContain('あなたの説明を公開しました');
    expect(root.querySelector<HTMLDialogElement>('.discussion')?.open).toBe(true);
  });

  it('shows references and sends a private report with retry feedback', async () => {
    send
      .mockRejectedValueOnce(new LearningError(503, 'UNAVAILABLE'))
      .mockResolvedValueOnce({ id: 'report', status: 'open' });
    const fixture = await create({
      ...question,
      references: [{ title: 'JWT specification', url: 'https://www.rfc-editor.org/rfc/rfc7519' }],
    });
    const root = fixture.nativeElement as HTMLElement;
    const reference = root.querySelector<HTMLAnchorElement>('.question-references a')!;
    expect(reference.getAttribute('rel')).toBe('noopener noreferrer');
    expect(reference.getAttribute('target')).toBe('_blank');
    root.querySelector<HTMLDetailsElement>('.question-report')!.open = true;
    const reason = root.querySelector<HTMLSelectElement>('.question-report select')!;
    reason.value = 'unclear';
    reason.dispatchEvent(new Event('change'));
    const details = root.querySelector<HTMLTextAreaElement>('.question-report textarea')!;
    details.value = 'Please define the term used in the question.';
    details.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    const submit = root.querySelector<HTMLButtonElement>('.question-report button[type="submit"]')!;
    submit.click();
    await fixture.whenStable();
    expect(root.querySelector('.question-report [role="alert"]')).not.toBeNull();
    expect(details.value).toContain('Please define');
    submit.click();
    await fixture.whenStable();
    expect(send.mock.calls[1][0]).toBe('/questions/question-1/reports');
    expect(send.mock.calls[1][2]).toEqual({ reason: 'unclear', details: details.value });
    expect(root.textContent).toContain('報告を受け付けました');
    expect(submit.disabled).toBe(true);
  });

  it('keeps supporting material inside mobile question details', async () => {
    compactViewport();
    const fixture = await create({
      ...quiz,
      references: [{ title: 'JWT specification', url: 'https://www.rfc-editor.org/rfc/rfc7519' }],
    });
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="question-stage"]')).not.toBeNull();
    expect(root.querySelector('.question-answer .question-references')).toBeNull();
    const dialog = root.querySelector<HTMLDialogElement>('.learning-details')!;
    expect(dialog.open).toBe(false);
    const opener = root.querySelector<HTMLButtonElement>('.deeper-button.info')!;
    opener.click();
    await fixture.whenStable();
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('.question-provenance')?.textContent).toContain(quiz.prompt);
    expect(dialog.querySelector('.question-references a')?.textContent).toContain(
      'JWT specification',
    );
    root.querySelector<HTMLButtonElement>('[aria-label="学習の詳細を閉じる"]')!.click();
    await fixture.whenStable();
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it('retains a failed tap choice and retries that same answer', async () => {
    send
      .mockRejectedValueOnce(new LearningError(503, 'UNAVAILABLE'))
      .mockResolvedValueOnce(tapResult(1));
    const fixture = await create(quiz);
    const root = fixture.nativeElement as HTMLElement;
    root.querySelectorAll<HTMLButtonElement>('.quiz-option')[1].click();
    await fixture.whenStable();
    expect(root.querySelectorAll('.state-picked')).toHaveLength(1);
    expect(root.querySelector('.reveal')).toBeNull();
    const recovery = root.querySelector<HTMLElement>('[data-testid="tap-recovery"]')!;
    expect(recovery.textContent).toContain('同じ回答');
    recovery.querySelector<HTMLButtonElement>('button')!.click();
    await fixture.whenStable();
    expect(send.mock.calls[0][2]).toEqual({ choice: 1 });
    expect(send.mock.calls[1][2]).toEqual({ choice: 1 });
    expect(root.querySelector('[data-testid="tap-recovery"]')).toBeNull();
    expect(root.querySelector('.reveal')).not.toBeNull();
  });

  it('provides a direct question-return sign-in link after a tap401', async () => {
    send.mockRejectedValueOnce(new LearningError(401, 'UNAUTHORIZED'));
    const fixture = await create(quiz);
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.quiz-option')!.click();
    await fixture.whenStable();
    const link = root.querySelector<HTMLAnchorElement>('.tap-recovery a')!;
    expect(link.textContent).toContain('ログインして回答');
    expect(link.getAttribute('href')).toContain('returnTo=%2Fquestions%2Fquiz-1');
    expect(link.getAttribute('href')).not.toContain('explain');
  });

  it('opens the mobile explanation task from an authenticated return intent', async () => {
    compactViewport();
    const fixture = await create(quiz, { explainOnOpen: true });
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector<HTMLDialogElement>('.learning-details')!.open).toBe(true);
    expect(root.querySelector('.learning-details textarea[id^="answer-"]')).not.toBeNull();
    expect(root.querySelector('.learning-details-heading')?.textContent).toContain(
      'なぜ？を説明する',
    );
  });

  it('carries the explanation intent when a guest signs in', async () => {
    compactViewport();
    user.set(null);
    status.set('guest');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = await create(quiz);
    fixture.nativeElement.querySelector('.mobile-learning-actions .explain').click();
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { reason: 'explain', returnTo: '/questions/quiz-1?explain=1' },
    });
  });

  it('reduces a paged question density while keeping code and every choice inline', async () => {
    compactViewport();
    let resize: ResizeObserverCallback = () => {};
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resize = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    const fixture = await create(
      { ...quiz, code: 'const first = 1;\nconsole.log(first);', codeLanguage: 'javascript' },
      { paged: true, nextable: true },
    );
    const root = fixture.nativeElement as HTMLElement;
    const stage = root.querySelector<HTMLElement>('[data-testid="question-stage"]')!;
    const natural = root.querySelector<HTMLElement>('.question-stage-natural')!;
    Object.defineProperty(stage, 'clientHeight', { configurable: true, value: 280 });
    vi.spyOn(natural, 'getBoundingClientRect').mockImplementation(
      () =>
        ({
          height: 320 * Number(natural.style.getPropertyValue('--question-density') || 1),
        }) as DOMRect,
    );
    resize([], {} as ResizeObserver);
    await vi.waitFor(() => {
      expect(Number(natural.style.getPropertyValue('--question-density'))).toBeLessThan(1);
      expect(natural.getBoundingClientRect().height).toBeLessThanOrEqual(281);
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const fitted = natural.style.getPropertyValue('--question-density');
    expect(root.getAttribute('data-fit-overflow')).toBeNull();
    expect(natural.querySelector('.reveal-slot')).not.toBeNull();
    expect(natural.hasAttribute('inert')).toBe(false);
    expect(root.querySelector('.question-stage-preview')).toBeNull();
    expect(root.querySelector('.full-question-button')).toBeNull();
    expect(natural.querySelector('pre')?.textContent).toContain('console.log(first);');
    expect(natural.querySelectorAll('.quiz-option')).toHaveLength(quiz.options!.length);
    send.mockResolvedValueOnce(tapResult(0));
    natural.querySelector<HTMLButtonElement>('.quiz-option')!.click();
    await fixture.whenStable();
    expect(natural.querySelectorAll('.quiz-option')).toHaveLength(quiz.options!.length);
    expect(natural.querySelector('.reveal-slot')).toBeNull();
    expect(natural.querySelector('.reveal')).not.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(natural.style.getPropertyValue('--question-density')).toBe(fitted);
    natural.querySelector<HTMLButtonElement>('.review-question')!.click();
    await fixture.whenStable();
    const dialog = root.querySelector<HTMLDialogElement>('.learning-details')!;
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('.reveal')?.textContent).toContain(tapResult(0).quickExplanation);
    const next = vi.fn();
    fixture.componentInstance.next.subscribe(next);
    dialog.querySelector<HTMLButtonElement>('.next-button')!.click();
    await fixture.whenStable();
    expect(next).toHaveBeenCalledOnce();
    expect(dialog.open).toBe(false);
    Object.defineProperty(stage, 'clientHeight', { configurable: true, value: 900 });
    resize([], {} as ResizeObserver);
    await vi.waitFor(() =>
      expect(Number(natural.style.getPropertyValue('--question-density'))).toBe(1.2),
    );
  });

  it('does not grow a short card so much that its code needs horizontal scrolling', async () => {
    compactViewport();
    let resize: ResizeObserverCallback = () => {};
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resize = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    const fixture = await create(
      { ...quiz, code: 'const message = greeting + , + name;', codeLanguage: 'javascript' },
      { paged: true, nextable: true },
    );
    const root = fixture.nativeElement as HTMLElement;
    const stage = root.querySelector<HTMLElement>('[data-testid="question-stage"]')!;
    const natural = root.querySelector<HTMLElement>('.question-stage-natural')!;
    const pre = natural.querySelector<HTMLElement>('pre')!;
    const density = () => Number(natural.style.getPropertyValue('--question-density') || 1);
    Object.defineProperty(stage, 'clientHeight', { configurable: true, value: 900 });
    vi.spyOn(natural, 'getBoundingClientRect').mockImplementation(
      () => ({ height: 200 * density() }) as DOMRect,
    );
    Object.defineProperty(pre, 'clientWidth', { configurable: true, value: 300 });
    Object.defineProperty(pre, 'scrollWidth', {
      configurable: true,
      get: () => (density() > 1.05 ? 340 : 300),
    });
    resize([], {} as ResizeObserver);
    await vi.waitFor(() => {
      expect(density()).toBeGreaterThan(1);
      expect(density()).toBeLessThanOrEqual(1.05);
    });
  });

  it('never shrinks a dense paged card below the reading floor; it scrolls inside instead', async () => {
    compactViewport();
    let resize: ResizeObserverCallback = () => {};
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resize = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    const fixture = await create(
      { ...quiz, code: 'const first = 1;\nconsole.log(first);', codeLanguage: 'javascript' },
      { paged: true, nextable: true },
    );
    const root = fixture.nativeElement as HTMLElement;
    const stage = root.querySelector<HTMLElement>('[data-testid="question-stage"]')!;
    const natural = root.querySelector<HTMLElement>('.question-stage-natural')!;
    Object.defineProperty(stage, 'clientHeight', { configurable: true, value: 280 });
    vi.spyOn(natural, 'getBoundingClientRect').mockImplementation(
      () =>
        ({
          height: 900 * Number(natural.style.getPropertyValue('--question-density') || 1),
        }) as DOMRect,
    );
    resize([], {} as ResizeObserver);
    await vi.waitFor(() => {
      expect(Number(natural.style.getPropertyValue('--question-density'))).toBe(0.72);
      expect(root.getAttribute('data-fit-overflow')).toBe('true');
    });
  });

  it('keeps shared-question cards in normal flow even when their content is long', async () => {
    compactViewport();
    const fixture = await create({ ...quiz, prompt: quiz.prompt.repeat(20) });
    const root = fixture.nativeElement as HTMLElement;
    expect(root.classList.contains('paged')).toBe(false);
    expect(root.querySelector('.full-question-button')).toBeNull();
    expect(root.querySelector('.question-stage-natural')?.hasAttribute('inert')).toBe(false);
  });

  it('shows answer feedback on a paged bug question and keeps the complete code in its sheet', async () => {
    compactViewport();
    const quickExplanation = 'The WHERE keyword is misspelled on line three.';
    const fixture = await create(
      {
        ...quiz,
        format: 'spot_bug',
        code: 'SELECT id\nFROM users\nWHER age > 20;',
        codeLanguage: 'sql',
        options: ['1', '2', '3'],
      },
      {
        paged: true,
        nextable: true,
        cachedTap: { choice: 0, correct: false, correctOption: 2, quickExplanation },
      },
    );
    const root = fixture.nativeElement as HTMLElement;
    const natural = root.querySelector('.question-stage-natural')!;
    expect(natural.querySelectorAll('button.code-line')).toHaveLength(3);
    expect(natural.querySelector('.reveal')?.textContent).toContain('おしい');
    natural.querySelector<HTMLButtonElement>('.review-question')!.click();
    await fixture.whenStable();
    const full = root.querySelector('.learning-details .full-question-stage')!;
    expect(full.querySelectorAll('button.code-line')).toHaveLength(3);
    expect(full.textContent).toContain('WHER age > 20;');
    expect(full.textContent).toContain(quickExplanation);
    expect(full.querySelector('.answer-summary')?.textContent).toContain('3行目');
    expect(full.querySelector('.answer-summary')?.textContent).toContain('1行目');
    expect(full.querySelector('.review-question')).toBeNull();
  });

  it('does not turn repeated swipe gestures into a double-tap like', async () => {
    const fixture = await create(quiz);
    const root = fixture.nativeElement as HTMLElement;
    const stage = root.querySelector<HTMLElement>('[data-testid="question-stage"]')!;
    const dispatch = (type: string, y: number) => {
      const event = new Event(type, { bubbles: true });
      Object.assign(event, { pointerType: 'touch', pointerId: 1, clientX: 100, clientY: y });
      stage.dispatchEvent(event);
    };
    dispatch('pointerdown', 160);
    dispatch('pointermove', 100);
    dispatch('pointerup', 160);
    dispatch('pointerdown', 160);
    dispatch('pointermove', 100);
    dispatch('pointerup', 160);
    await fixture.whenStable();
    expect(root.querySelector('.heart-burst')).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });
});
