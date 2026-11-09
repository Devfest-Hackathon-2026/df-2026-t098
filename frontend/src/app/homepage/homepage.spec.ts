import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { Homepage } from './homepage';
import { AuthSession, AuthUser, SessionStatus } from '../auth/auth-session';
import { LearningApi, LearningError } from '../learning/learning-api';
import { FeedStore, RELEARN_GAP } from '../learning/feed-store';
import type { FeedBatch, Question, TapResult } from '../learning/learning.types';

describe('Personal learning feed', () => {
  const user = signal<AuthUser | null>(null);
  const status = signal<SessionStatus>('guest');
  const send = vi.fn();
  const get = vi.fn();
  const question = (id: string): Question => ({
    id,
    title: 'JWT',
    prompt: 'Why can a JWT be verified?',
    code: null,
    codeLanguage: null,
    topics: ['general'],
    difficulty: 'beginner',
    language: 'ja',
    source: 'ai',
    author: null,
    likes: 0,
    liked: false,
    saved: false,
    createdAt: new Date().toISOString(),
    format: 'choice',
    options: ['Signature', 'Cookie', 'Cache'],
    tap: null,
  });
  const batch = (prefix: string): FeedBatch => ({
    requestId: prefix,
    questions: Array.from({ length: 5 }, (_, index) => question(prefix + index)),
    communityQuestion: null,
  });
  let poolCount = 0;
  const pool = () => {
    const prefix = 'pool' + poolCount++ + '-';
    return {
      questions: Array.from({ length: 5 }, (_, index) => question(prefix + index)),
      reviewQuestions: [],
    };
  };
  const tapResult = (questionId: string, correct: boolean): TapResult => ({
    questionId,
    choice: correct ? 0 : 1,
    correct,
    correctOption: 0,
    quickExplanation: 'A signature proves integrity.',
    xpAwarded: correct ? 5 : 0,
    review: false,
    combo: null,
    progress: null,
  });

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    poolCount = 0;
    user.set({
      id: 'learner',
      email: 'learner@example.test',
      name: 'Learner',
      username: null,
      avatarUrl: null,
    });
    status.set('authenticated');
    send.mockReset().mockImplementation(async (path: string) => {
      if (path === '/feed/batches') return batch('a');
      throw new Error('Unexpected ' + path);
    });
    get.mockReset().mockImplementation(async (path: string) => {
      if (path.startsWith('/feed/pool')) return pool();
      if (path.startsWith('/daily'))
        return {
          day: '2026-11-08',
          question: null,
          answered: 0,
          solved: 0,
          solvers: [],
          you: null,
        };
      if (path === '/progress') throw new LearningError(503, 'AI_UNAVAILABLE');
      return { questions: [] };
    });
    TestBed.configureTestingModule({
      imports: [Homepage],
      providers: [
        provideRouter([]),
        {
          provide: AuthSession,
          useValue: { user, status, loggingOut: signal(false), refresh: vi.fn(), logout: vi.fn() },
        },
        { provide: LearningApi, useValue: { send, get } },
      ],
    });
  });
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  async function settle(fixture: ComponentFixture<Homepage>) {
    for (let round = 0; round < 6; round++) {
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
    }
    fixture.detectChanges();
  }
  const cards = (root: HTMLElement) => root.querySelectorAll('.question-card');
  const batchCalls = () => send.mock.calls.filter(([path]) => path === '/feed/batches');

  it('shows instant pool questions, then appends a personalized Gemini batch', async () => {
    const fixture = TestBed.createComponent(Homepage);
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;
    expect(get.mock.calls.some(([path]) => path === '/feed/pool?language=ja')).toBe(true);
    expect(batchCalls()).toHaveLength(1);
    expect(cards(root)).toHaveLength(10);
    expect(root.querySelector('.quiz-option')?.textContent).toContain('Signature');
    expect(root.querySelector('.swipe-hint')).not.toBeNull();
  });

  it('keeps the feed position when a secondary tab is destroyed', async () => {
    const fixture = TestBed.createComponent(Homepage);
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;
    const content = root.querySelector<HTMLElement>('main.content')!;
    content.scrollTop = 321;
    const profile = [...root.querySelectorAll<HTMLButtonElement>('.main-nav button')].find(
      (button) => button.textContent?.includes('プロフィール'),
    )!;
    profile.click();
    await settle(fixture);
    content.scrollTop = 99;
    fixture.destroy();
    expect(TestBed.inject(FeedStore).scrollTop).toBe(321);
  });

  it('does not answer inert measurement controls through number shortcuts', async () => {
    const fixture = TestBed.createComponent(Homepage);
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector('.question-stage-natural')!.setAttribute('inert', '');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
    await settle(fixture);
    expect(send.mock.calls.some(([path]) => path.includes('/taps'))).toBe(false);
  });

  it('keeps cards ahead by loading more when the learner nears the end', async () => {
    const fixture = TestBed.createComponent(Homepage);
    await settle(fixture);
    const store = TestBed.inject(FeedStore);
    send.mockImplementation(async () => batch('b'));
    store.setActive(8);
    await settle(fixture);
    expect(batchCalls()).toHaveLength(2);
    expect(cards(fixture.nativeElement)).toHaveLength(15);
    expect(store.hasScrolled()).toBe(true);
  });

  it('shows an accessible skeleton while the first questions load', () => {
    get.mockImplementation(() => new Promise(() => {}));
    const fixture = TestBed.createComponent(Homepage);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('app-loading-skeleton')).not.toBeNull();
    expect(root.querySelector('[role="status"] .sr-only')?.textContent).toContain('読み込み');
    expect(root.querySelector('.feed-state p')).toBeNull();
  });

  it('keeps learning with pool questions when Gemini fails, and retries with the same key', async () => {
    send.mockRejectedValueOnce(new LearningError(503, 'AI_UNAVAILABLE'));
    const fixture = TestBed.createComponent(Homepage);
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;
    expect(cards(root).length).toBeGreaterThanOrEqual(5);
    expect(root.querySelector('.feed-status')?.textContent).toContain('Gemini');
    const requestId = batchCalls()[0][2].requestId;
    root.querySelector<HTMLButtonElement>('.feed-status button')!.click();
    await settle(fixture);
    expect(batchCalls()[1][2].requestId).toBe(requestId);
    expect(root.querySelector('.feed-status button')).toBeNull();
  });

  it('ignores a late private batch after logout and loads the public pool', async () => {
    let complete!: (batch: FeedBatch) => void;
    send.mockImplementationOnce(() => new Promise<FeedBatch>((resolve) => (complete = resolve)));
    const fixture = TestBed.createComponent(Homepage);
    await settle(fixture);
    user.set(null);
    status.set('guest');
    fixture.detectChanges();
    complete(batch('late'));
    await settle(fixture);
    fixture.detectChanges();
    const ids = [...fixture.nativeElement.querySelectorAll('.question-card')].map(
      (card: HTMLElement) => card.dataset['questionId'],
    );
    expect(ids.some((id) => id?.startsWith('late'))).toBe(false);
    expect(ids.length).toBe(5);
  });

  it('uses a fresh batch key after saved preferences no longer match a pending request', async () => {
    const staleId = crypto.randomUUID();
    sessionStorage.setItem('whylint-pending-batch:learner:ja', staleId);
    send.mockRejectedValueOnce(new LearningError(409, 'REQUEST_MISMATCH'));
    const fixture = TestBed.createComponent(Homepage);
    await settle(fixture);
    expect(batchCalls()[0][2].requestId).toBe(staleId);
    expect(batchCalls()[0][2]).not.toHaveProperty('excludeQuestionIds');
    fixture.nativeElement.querySelector('.feed-status button').click();
    await settle(fixture);
    expect(batchCalls()[1][2].requestId).not.toBe(staleId);
  });

  it('replaces a corrupted saved request key before making a request', async () => {
    sessionStorage.setItem('whylint-pending-batch:learner:ja', 'invalid');
    const fixture = TestBed.createComponent(Homepage);
    await settle(fixture);
    expect(batchCalls()[0][2].requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('keeps the original seen-question snapshot when retrying after more pool cards arrive', async () => {
    const firstId = crypto.randomUUID();
    const laterId = crypto.randomUUID();
    let pools = 0;
    get.mockImplementation(async (path: string) => {
      if (path.startsWith('/feed/pool')) {
        return { questions: [question(pools++ === 0 ? firstId : laterId)], reviewQuestions: [] };
      }
      if (path.startsWith('/daily')) return { question: null };
      return { questions: [] };
    });
    send.mockRejectedValueOnce(new LearningError(503, 'AI_UNAVAILABLE'));
    const fixture = TestBed.createComponent(Homepage);
    await settle(fixture);
    const original = batchCalls()[0][2];
    expect(original.excludeQuestionIds).toEqual([firstId]);
    const store = TestBed.inject(FeedStore);
    await store.loadPool();
    await store.loadBatch();
    expect(batchCalls()[1][2]).toEqual(original);
    await store.loadBatch();
    expect(batchCalls()[2][2].requestId).not.toBe(original.requestId);
    expect(batchCalls()[2][2].excludeQuestionIds).toEqual([firstId, laterId]);
  });

  it('restores a pending request and its original exclusion snapshot', async () => {
    const requestId = crypto.randomUUID();
    const excludeQuestionIds = [crypto.randomUUID(), crypto.randomUUID()];
    const key = 'whylint-pending-batch:learner:ja';
    sessionStorage.setItem(key, JSON.stringify({ requestId, excludeQuestionIds }));
    send.mockRejectedValueOnce(new LearningError(503, 'AI_UNAVAILABLE'));
    const fixture = TestBed.createComponent(Homepage);
    await settle(fixture);
    expect(batchCalls()[0][2]).toEqual({ requestId, excludeQuestionIds, language: 'ja' });
    await TestBed.inject(FeedStore).loadBatch();
    expect(batchCalls()[1][2]).toEqual(batchCalls()[0][2]);
    expect(sessionStorage.getItem(key)).toBeNull();
  });

  it('rejects a malformed stored exclusion list without reusing its request ID', async () => {
    const requestId = crypto.randomUUID();
    sessionStorage.setItem(
      'whylint-pending-batch:learner:ja',
      JSON.stringify({ requestId, excludeQuestionIds: ['not-a-question-uuid'] }),
    );
    const fixture = TestBed.createComponent(Homepage);
    await settle(fixture);
    expect(batchCalls()[0][2].requestId).not.toBe(requestId);
  });

  it('continues without wedging generation when browser storage reads or writes fail', async () => {
    const originalGet = Storage.prototype.getItem;
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (
      this: Storage,
      key,
    ) {
      if (key.startsWith('whylint-pending-batch:')) throw new Error('Storage unavailable');
      return originalGet.call(this, key);
    });
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage full');
    });
    try {
      send.mockRejectedValueOnce(new LearningError(503, 'AI_UNAVAILABLE'));
      const fixture = TestBed.createComponent(Homepage);
      await settle(fixture);
      const original = batchCalls()[0][2];
      const store = TestBed.inject(FeedStore);
      expect(store.generating()).toBe(false);
      await store.loadBatch();
      expect(batchCalls()[1][2]).toEqual(original);
      expect(store.generating()).toBe(false);
      expect(store.notice()).toBeNull();
    } finally {
      read.mockRestore();
      write.mockRestore();
    }
  });

  it('does not restore a completed stale request when clearing storage fails', async () => {
    const requestId = crypto.randomUUID();
    sessionStorage.setItem('whylint-pending-batch:learner:ja', requestId);
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    try {
      const fixture = TestBed.createComponent(Homepage);
      await settle(fixture);
      await TestBed.inject(FeedStore).loadBatch();
      expect(batchCalls()[0][2].requestId).toBe(requestId);
      expect(batchCalls()[1][2].requestId).not.toBe(requestId);
      expect(TestBed.inject(FeedStore).generating()).toBe(false);
    } finally {
      remove.mockRestore();
    }
  });

  it('filters a late Gemini paraphrase of an already appended pool card', async () => {
    const initialId = crypto.randomUUID();
    const originalId = crypto.randomUUID();
    const paraphraseId = crypto.randomUUID();
    const distinctId = crypto.randomUUID();
    const firstCodeId = crypto.randomUUID();
    const secondCodeId = crypto.randomUUID();
    const hint = (tokens: string[], exact: string, codeKey: string | null = null) => ({
      version: 1 as const,
      exact: exact.repeat(64),
      tokens,
      codeKey,
    });
    const terms = ['https', 'http', 'encrypt', 'personal', 'data'];
    const original = { ...question(originalId), novelty: hint(terms, 'a') };
    const paraphrase = {
      ...question(paraphraseId),
      novelty: hint([...terms, 'transmit'], 'b'),
    };
    const distinct = {
      ...question(distinctId),
      novelty: hint(['https', 'certificate', 'identity', 'verify'], 'c'),
    };
    const codeTerms = ['predict', 'output', 'return', 'value'];
    const firstCode = {
      ...question(firstCodeId),
      code: 'console.log(1);',
      novelty: hint(codeTerms, 'd', 'e'.repeat(64)),
    };
    const secondCode = {
      ...question(secondCodeId),
      code: 'console.log(2);',
      novelty: hint(codeTerms, 'd', 'f'.repeat(64)),
    };
    let pools = 0;
    get.mockImplementation(async (path: string) => {
      if (path.startsWith('/feed/pool'))
        return {
          questions: pools++ === 0 ? [question(initialId)] : [original],
          reviewQuestions: [],
        };
      if (path.startsWith('/daily')) return { question: null };
      return { questions: [] };
    });
    let complete!: (batch: FeedBatch) => void;
    send.mockImplementationOnce(() => new Promise<FeedBatch>((resolve) => (complete = resolve)));
    const fixture = TestBed.createComponent(Homepage);
    await settle(fixture);
    const store = TestBed.inject(FeedStore);
    await store.loadPool();
    complete({
      requestId: 'pending',
      questions: [paraphrase, distinct, firstCode, secondCode],
      communityQuestion: null,
    });
    await settle(fixture);
    const ids = store
      .items()
      .flatMap((item) => (item.kind === 'question' ? [item.question.id] : []));
    expect(ids).toEqual([initialId, originalId, distinctId, firstCodeId, secondCodeId]);
    await store.loadPool();
    const poolCall = get.mock.calls
      .filter(([path]) => String(path).startsWith('/feed/pool'))
      .at(-1)!;
    const excluded = new URLSearchParams(String(poolCall[0]).split('?')[1]).get('exclude')!;
    expect(excluded).toContain(originalId);
    expect(excluded).not.toContain(paraphraseId);
  });

  it('allows an intentional due review of a recently seen concept', async () => {
    const terms = ['https', 'http', 'encrypt', 'personal', 'data'];
    const original = {
      ...question(crypto.randomUUID()),
      novelty: {
        version: 1 as const,
        exact: 'a'.repeat(64),
        tokens: terms,
        codeKey: null,
      },
    };
    const review = {
      ...question(crypto.randomUUID()),
      novelty: {
        version: 1 as const,
        exact: 'b'.repeat(64),
        tokens: [...terms, 'transmit'],
        codeKey: null,
      },
      review: { box: 2, missedAt: null },
    };
    get.mockImplementation(async (path: string) => {
      if (path.startsWith('/feed/pool')) return { questions: [original], reviewQuestions: [] };
      if (path.startsWith('/daily')) return { question: null };
      return { questions: [] };
    });
    send.mockResolvedValueOnce({
      requestId: 'review',
      questions: [],
      communityQuestion: null,
      reviewQuestions: [review],
    });
    const fixture = TestBed.createComponent(Homepage);
    await settle(fixture);
    const items = TestBed.inject(FeedStore).items();
    expect(items).toHaveLength(2);
    expect(items[1].kind === 'question' && items[1].question.review?.box).toBe(2);
  });

  it('shows the 09:00 review of a card already seen this session as its own card', async () => {
    const seenCard = question(crypto.randomUUID());
    get.mockImplementation(async (path: string) => {
      if (path.startsWith('/feed/pool')) return { questions: [seenCard], reviewQuestions: [] };
      if (path.startsWith('/daily')) return { question: null };
      return { questions: [] };
    });
    send.mockResolvedValueOnce({
      requestId: 'morning',
      questions: [],
      communityQuestion: null,
      reviewQuestions: [{ ...seenCard, review: { box: 1, missedAt: null } }],
    });
    const fixture = TestBed.createComponent(Homepage);
    await settle(fixture);
    const items = TestBed.inject(FeedStore).items();
    expect(items.map((item) => item.key)).toEqual([seenCard.id, 'review-' + seenCard.id]);
  });

  it.each([true, false])(
    'bounds the pool refill after a fully filtered late batch (recovers=%s)',
    async (recovers) => {
      const original = {
        ...question(crypto.randomUUID()),
        novelty: {
          version: 1 as const,
          exact: 'a'.repeat(64),
          tokens: ['https', 'http', 'encrypt', 'personal', 'data'],
          codeKey: null,
        },
      };
      const replacement = {
        ...question(crypto.randomUUID()),
        novelty: {
          ...original.novelty,
          exact: 'b'.repeat(64),
          tokens: recovers
            ? ['https', 'certificate', 'identity', 'verify']
            : original.novelty.tokens,
        },
      };
      let pools = 0;
      get.mockImplementation(async (path: string) => {
        if (path.startsWith('/feed/pool')) {
          return { questions: [pools++ === 0 ? original : replacement], reviewQuestions: [] };
        }
        if (path.startsWith('/daily')) return { question: null };
        return { questions: [] };
      });
      let complete!: (value: FeedBatch) => void;
      send.mockImplementationOnce(() => new Promise<FeedBatch>((resolve) => (complete = resolve)));
      const fixture = TestBed.createComponent(Homepage);
      await settle(fixture);
      complete({
        requestId: 'late',
        questions: [{ ...original, id: crypto.randomUUID() }],
        communityQuestion: null,
      });
      await settle(fixture);
      const store = TestBed.inject(FeedStore);
      expect(pools).toBe(recovers ? 2 : 3);
      expect(store.items()).toHaveLength(recovers ? 2 : 1);
      expect(store.loading()).toBe(false);
      expect(store.generating()).toBe(false);
      expect(batchCalls()).toHaveLength(1);
    },
  );

  it('brings a missed card back a few cards later', async () => {
    const fixture = TestBed.createComponent(Homepage);
    await settle(fixture);
    const store = TestBed.inject(FeedStore);
    const first = store.items()[0];
    store.tapped(first, tapResult('pool0-0', false));
    fixture.detectChanges();
    const relearn = store.items()[1 + RELEARN_GAP];
    expect(relearn.kind === 'question' && relearn.relearn).toBe(true);
    expect(relearn.kind === 'question' && relearn.question.id).toBe('pool0-0');
    store.tapped(first, tapResult('pool0-0', false));
    expect(store.items().filter((item) => item.kind === 'question' && item.relearn)).toHaveLength(
      1,
    );
  });

  it('lets guests answer immediately and invites them to sign in after a few taps', async () => {
    user.set(null);
    status.set('guest');
    const fixture = TestBed.createComponent(Homepage);
    await settle(fixture);
    expect(batchCalls()).toHaveLength(0);
    const store = TestBed.inject(FeedStore);
    for (let index = 0; index < 3; index++)
      store.tapped(store.items()[index], tapResult('pool0-' + index, true));
    fixture.detectChanges();
    expect(store.items()[3].kind).toBe('signin');
    expect(fixture.nativeElement.querySelector('.signin-card a')?.getAttribute('href')).toBe(
      '/login',
    );
  });

  it('keeps the feed when switching tabs and loads the practice collection', async () => {
    const fixture = TestBed.createComponent(Homepage);
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;
    const tab = (label: string) =>
      [...root.querySelectorAll<HTMLButtonElement>('.main-nav button')].find((button) =>
        button.textContent?.includes(label),
      )!;
    tab('復習').click();
    await settle(fixture);
    expect(get).toHaveBeenCalledWith('/reviews', expect.any(AbortSignal));
    expect(root.textContent).toContain('毎朝9時');
    const requests = get.mock.calls.length + send.mock.calls.length;
    tab('フィード').click();
    await settle(fixture);
    expect(cards(root)).toHaveLength(10);
    expect(get.mock.calls.length + send.mock.calls.length).toBe(requests);
  });

  it('retains each instance’s tap after switching tabs and clears it on account changes', async () => {
    const fixture = TestBed.createComponent(Homepage);
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;
    const store = TestBed.inject(FeedStore);
    const original = store.items()[0];
    store.tapped(original, tapResult('pool0-0', false));
    await settle(fixture);
    const repeated = store.items().find((item) => item.kind === 'question' && item.relearn)!;
    store.tapped(repeated, tapResult('pool0-0', true));
    await settle(fixture);
    const tab = (label: string) =>
      [...root.querySelectorAll<HTMLButtonElement>('.main-nav button')].find((button) =>
        button.textContent?.includes(label),
      )!;
    tab('復習').click();
    await settle(fixture);
    tab('フィード').click();
    await settle(fixture);
    const instances = root.querySelectorAll('[data-question-id="pool0-0"]');
    expect(instances).toHaveLength(2);
    expect(instances[0].querySelector('.reveal')?.textContent).toContain('おしい');
    expect(instances[1].querySelector('.reveal')?.textContent).toContain('正解');
    expect(root.querySelectorAll('#discussion-pool0-0')).toHaveLength(1);
    expect(root.querySelectorAll('#discussion-' + repeated.key)).toHaveLength(1);
    user.set(null);
    status.set('guest');
    await settle(fixture);
    expect(store.items().every((item) => item.kind !== 'question' || !item.tap)).toBe(true);
    expect(root.querySelector('.reveal')).toBeNull();
  });
});
