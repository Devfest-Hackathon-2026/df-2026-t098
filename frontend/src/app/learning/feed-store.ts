import { DOCUMENT } from '@angular/common';
import { effect, inject, Injectable, signal, untracked } from '@angular/core';
import { AuthSession } from '../auth/auth-session';
import { OnboardingState } from '../onboarding/onboarding-state';
import { BlockStore } from './block-store';
import { DisplaySettings } from './display-settings';
import { LearningApi, LearningError, learningError } from './learning-api';
import { ProgressStore } from './progress-store';
import { similarQuestionNovelty, validQuestionNovelty } from './question-novelty';
import type {
  Adaptation,
  DailyChallenge,
  FeedBatch,
  PoolResult,
  Question,
  QuestionNovelty,
  QuestionTap,
  TapResult,
} from './learning.types';

export type FeedItem =
  | {
      key: string;
      kind: 'question';
      question: Question;
      relearn?: boolean;
      daily?: boolean;
      tap?: QuestionTap;
    }
  | { key: string; kind: 'signin' }
  | { key: string; kind: 'blocked'; authorName: string };

interface PendingBatch {
  requestId: string;
  excludeQuestionIds?: string[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const RELEARN_GAP = 4;
export const GUEST_SIGNIN_AFTER = 3;

@Injectable({ providedIn: 'root' })
export class FeedStore {
  private readonly api = inject(LearningApi);
  private readonly session = inject(AuthSession);
  private readonly settings = inject(DisplaySettings);
  private readonly onboarding = inject(OnboardingState);
  private readonly progress = inject(ProgressStore);
  private readonly blocks = inject(BlockStore);
  private readonly document = inject(DOCUMENT);
  private controller = new AbortController();
  private identity = '';
  private pendingBatch: PendingBatch | null = null;
  private nextKey = 1;
  private readonly seen = new Set<string>();
  private readonly noveltyHistory: QuestionNovelty[] = [];
  private readonly reviewed = new Set<string>();
  private readonly relearned = new Set<string>();
  private guestTaps = 0;
  private signinShown = false;
  private poolExhausted = false;

  readonly items = signal<FeedItem[]>([]);
  readonly activeIndex = signal(0);
  readonly loading = signal(false);
  readonly booting = signal(false);
  readonly generating = signal(false);
  readonly error = signal('');
  readonly notice = signal<'fallback' | null>(null);
  readonly adaptation = signal<Adaptation | null>(null);
  readonly daily = signal<DailyChallenge | null>(null);
  readonly hasScrolled = signal(false);
  scrollTop = 0;
  pruneHandler: ((removed: number, apply: () => void) => void) | null = null;

  constructor() {
    effect(() => {
      const blocked = this.blocks.lastBlocked();
      if (blocked) untracked(() => this.hideAuthor(blocked.id, blocked.name));
    });
    effect(() => {
      if (this.blocks.unblockCount() > 0) untracked(() => this.restart());
    });
  }

  sync(): void {
    const status = this.session.status();
    if (status === 'loading' || status === 'unavailable') return;
    const identity = (this.session.user()?.id ?? 'guest') + ':' + this.settings.language();
    if (identity === this.identity) return;
    this.identity = identity;
    this.reset();
    void this.start();
  }

  restart(): void {
    this.identity = '';
    this.sync();
  }

  private reset(): void {
    this.controller.abort();
    this.controller = new AbortController();
    this.items.set([]);
    this.activeIndex.set(0);
    this.loading.set(false);
    this.booting.set(false);
    this.generating.set(false);
    this.error.set('');
    this.notice.set(null);
    this.adaptation.set(null);
    this.daily.set(null);
    this.hasScrolled.set(false);
    this.scrollTop = 0;
    this.pendingBatch = this.readPendingBatch(
      this.storage(),
      'whylint-pending-batch:' + this.identity,
    );
    this.seen.clear();
    this.noveltyHistory.length = 0;
    this.reviewed.clear();
    this.relearned.clear();
    this.guestTaps = 0;
    this.signinShown = false;
    this.poolExhausted = false;
  }

  private get authenticated(): boolean {
    return this.session.status() === 'authenticated';
  }

  private async start(): Promise<void> {
    const signal = this.controller.signal;
    this.booting.set(true);
    await this.loadDaily(signal);
    if (signal.aborted) return;
    await this.loadPool();
    if (!signal.aborted) this.booting.set(false);
    if (signal.aborted) return;
    if (this.authenticated) void this.loadBatch();
  }

  setActive(index: number): void {
    if (index > 0) this.hasScrolled.set(true);
    this.activeIndex.set(index);
    const ahead = this.items().length - 1 - index;
    if (ahead > 2) return;
    const waiting = this.generating();
    if (this.authenticated && !waiting && !this.error()) void this.loadBatch();
    if ((!this.authenticated || waiting || this.error()) && !this.loading()) void this.loadPool();
  }

  retry(): void {
    this.error.set('');
    if (this.authenticated) void this.loadBatch();
    else void this.loadPool();
  }

  tapped(item: FeedItem, result: TapResult): void {
    if (item.kind !== 'question') return;
    const index = this.items().findIndex((candidate) => candidate.key === item.key);
    if (index < 0) return;
    this.items.update((items) =>
      items.map((candidate) =>
        candidate.key === item.key && candidate.kind === 'question'
          ? {
              ...candidate,
              tap: {
                choice: result.choice,
                correct: result.correct,
                correctOption: result.correctOption,
                quickExplanation: result.quickExplanation,
              },
            }
          : candidate,
      ),
    );
    if (!result.correct && !item.relearn && !this.relearned.has(item.question.id)) {
      this.relearned.add(item.question.id);
      const copy: FeedItem = {
        key: 'relearn-' + this.nextKey++,
        kind: 'question',
        question: { ...item.question, tap: null, review: undefined, reason: undefined },
        relearn: true,
      };
      this.insertAt(index + 1 + RELEARN_GAP, copy);
    }
    if (!this.authenticated) {
      this.guestTaps++;
      if (this.guestTaps >= GUEST_SIGNIN_AFTER && !this.signinShown) {
        this.signinShown = true;
        this.insertAt(index + 1, { key: 'signin', kind: 'signin' });
      }
    }
    if (item.daily) void this.loadDaily(this.controller.signal);
  }

  /**
   * Replaces a blocked learner's questions already in the feed with a notice. The slide
   * stays, so paging and the active position do not move.
   */
  hideAuthor(authorId: string, authorName: string): void {
    this.items.update((items) =>
      items.map((item) =>
        item.kind === 'question' && item.question.author?.id === authorId
          ? { key: item.key, kind: 'blocked' as const, authorName }
          : item,
      ),
    );
  }

  private insertAt(position: number, item: FeedItem): void {
    this.items.update((items) => {
      const next = [...items];
      next.splice(Math.min(Math.max(position, 0), next.length), 0, item);
      return next;
    });
  }

  private append(questions: Question[], reviews: Question[] = []): number {
    const fresh: Question[] = [];
    for (const question of questions) {
      if (this.seen.has(question.id) || this.similarToHistory(question)) continue;
      this.seen.add(question.id);
      this.rememberNovelty(question);
      fresh.push(question);
    }
    const freshReviews: Question[] = [];
    for (const question of reviews) {
      if (this.reviewed.has(question.id)) continue;
      this.reviewed.add(question.id);
      this.seen.add(question.id);
      this.rememberNovelty(question);
      freshReviews.push(question);
    }
    const items: FeedItem[] = fresh.map((question) => ({
      key: question.id,
      kind: 'question',
      question,
    }));
    freshReviews.forEach((question, index) =>
      items.splice(Math.min(1 + index * 3, items.length), 0, {
        key: 'review-' + question.id,
        kind: 'question',
        question,
      }),
    );
    if (items.length) this.items.update((current) => [...current, ...items]);
    this.prune();
    return items.length;
  }

  private similarToHistory(question: Question): boolean {
    const hint = question.novelty;
    return (
      validQuestionNovelty(hint) &&
      this.noveltyHistory.some((previous) => similarQuestionNovelty(hint, previous))
    );
  }

  private rememberNovelty(question: Question): void {
    if (!validQuestionNovelty(question.novelty)) return;
    this.noveltyHistory.push(question.novelty);
    if (this.noveltyHistory.length > 300)
      this.noveltyHistory.splice(0, this.noveltyHistory.length - 300);
  }

  private async loadDaily(signal: AbortSignal): Promise<void> {
    try {
      const daily = await this.api.get<DailyChallenge>(
        '/daily?language=' + this.settings.language(),
        signal,
      );
      if (signal.aborted) return;
      this.daily.set(daily);
      const question = daily.question;
      if (question && !question.tap && !this.seen.has(question.id)) {
        this.seen.add(question.id);
        this.rememberNovelty(question);
        this.insertAt(0, { key: 'daily-' + question.id, kind: 'question', question, daily: true });
      }
    } catch {
    }
  }

  async loadPool(refill = true): Promise<void> {
    if (this.loading() || this.poolExhausted) return;
    const signal = this.controller.signal;
    let needsRefill = false;
    this.loading.set(true);
    try {
      const params = new URLSearchParams({ language: this.settings.language() });
      if (!this.authenticated) {
        const preferences = this.onboarding.read();
        if (preferences) {
          params.set('topics', [...preferences.interests, ...preferences.technologies].join(','));
          params.set('difficulty', preferences.difficulty);
        }
      }
      // Cap the IDs so the query stays under proxy URL limits.
      const exclude = [...this.seen].filter((id) => UUID.test(id)).slice(-150);
      if (exclude.length) params.set('exclude', exclude.join(','));
      const result = await this.api.get<PoolResult>('/feed/pool?' + params, signal);
      if (signal.aborted) return;
      if (!result.questions.length && !result.reviewQuestions.length) this.poolExhausted = true;
      const added = this.append(result.questions, result.reviewQuestions);
      needsRefill =
        refill &&
        added === 0 &&
        !this.poolExhausted &&
        this.items().length - this.activeIndex() <= 3;
      if (!this.authenticated) this.error.set('');
    } catch (error) {
      if (!signal.aborted && !this.items().length)
        this.error.set(learningError(error, this.settings.language()));
    } finally {
      if (!signal.aborted) {
        this.loading.set(false);
        if (needsRefill) void this.loadPool(false);
      }
    }
  }

  async loadBatch(): Promise<void> {
    if (this.generating() || !this.authenticated) return;
    const signal = this.controller.signal;
    this.generating.set(true);
    const storageKey = 'whylint-pending-batch:' + this.identity;
    const storage = this.storage();
    try {
      if (!this.pendingBatch) {
        this.pendingBatch = {
          requestId: crypto.randomUUID(),
          excludeQuestionIds: [...this.seen].filter((id) => UUID.test(id)).slice(-300),
        };
        this.savePendingBatch(storage, storageKey, this.pendingBatch);
      }
      const pending = this.pendingBatch;
      const result = await this.api.send<FeedBatch>(
        '/feed/batches',
        'POST',
        { ...pending, language: this.settings.language() },
        signal,
      );
      if (signal.aborted) return;
      this.pendingBatch = null;
      this.savePendingBatch(storage, storageKey, null);
      this.notice.set(null);
      this.error.set('');
      const added = this.append(
        [...result.questions, ...(result.communityQuestion ? [result.communityQuestion] : [])],
        result.reviewQuestions ?? [],
      );
      if (added === 0 && this.items().length - this.activeIndex() <= 3) void this.loadPool();
      if (result.adaptation) {
        this.adaptation.set(result.adaptation);
        if (result.adaptation.change)
          this.progress.toast({ kind: 'difficulty', direction: result.adaptation.change });
      }
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof LearningError && error.code === 'REQUEST_MISMATCH') {
        this.pendingBatch = null;
        this.savePendingBatch(storage, storageKey, null);
      }
      this.notice.set('fallback');
      if (this.items().length - this.activeIndex() <= 3) void this.loadPool();
      if (!this.items().length) this.error.set(learningError(error, this.settings.language()));
    } finally {
      if (!signal.aborted) this.generating.set(false);
    }
  }

  private readPendingBatch(storage: Storage | null, key: string): PendingBatch | null {
    try {
      const value = storage?.getItem(key);
      if (!value) return null;
      // Older clients saved only the ID. Reuse the original payload on retry.
      if (UUID.test(value)) return { requestId: value };
      const pending: unknown = JSON.parse(value);
      if (!pending || typeof pending !== 'object') return null;
      const { requestId, excludeQuestionIds } = pending as Partial<PendingBatch>;
      if (typeof requestId !== 'string' || !UUID.test(requestId)) return null;
      if (
        excludeQuestionIds !== undefined &&
        (!Array.isArray(excludeQuestionIds) ||
          excludeQuestionIds.length > 300 ||
          excludeQuestionIds.some((id) => typeof id !== 'string' || !UUID.test(id)) ||
          new Set(excludeQuestionIds).size !== excludeQuestionIds.length)
      )
        return null;
      return excludeQuestionIds === undefined ? { requestId } : { requestId, excludeQuestionIds };
    } catch {
      return null;
    }
  }

  private savePendingBatch(
    storage: Storage | null,
    key: string,
    pending: PendingBatch | null,
  ): void {
    try {
      if (pending) storage?.setItem(key, JSON.stringify(pending));
      else storage?.removeItem(key);
    } catch {
    }
  }

  private storage(): Storage | null {
    try {
      return this.document.defaultView?.sessionStorage ?? null;
    } catch {
      return null;
    }
  }

  private prune(): void {
    const keepFrom = this.activeIndex() - 8;
    if (this.items().length <= 40 || keepFrom <= 0) return;
    const apply = () => {
      this.items.update((items) => items.slice(keepFrom));
      this.activeIndex.update((index) => index - keepFrom);
    };
    if (this.pruneHandler) this.pruneHandler(keepFrom, apply);
    else apply();
  }
}
