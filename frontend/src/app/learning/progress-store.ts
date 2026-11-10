import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { AuthSession } from '../auth/auth-session';
import { GuestSession, type GuestImport } from './guest-session';
import { LearningApi } from './learning-api';
import type { Progress, TapResult } from './learning.types';

export type Toast =
  | { id: number; kind: 'level'; level: number }
  | { id: number; kind: 'badge'; badge: string }
  | { id: number; kind: 'combo'; combo: number }
  | { id: number; kind: 'difficulty'; direction: 'up' | 'down' }
  | { id: number; kind: 'goal' };

type ToastInput = Toast extends infer T ? (T extends Toast ? Omit<T, 'id'> : never) : never;

const COMBO_MILESTONES = new Set([3, 5, 10, 15, 20, 30, 50]);

@Injectable({ providedIn: 'root' })
export class ProgressStore {
  private readonly api = inject(LearningApi);
  private readonly session = inject(AuthSession);
  private readonly guest = inject(GuestSession);
  private owner: string | null | undefined;
  private controller = new AbortController();
  private transfer: { accountId: string; task: Promise<void> } | null = null;
  private nextToast = 1;
  readonly progress = signal<Progress | null>(null);
  readonly guestCombo = signal(this.guest.counters.combo);
  readonly guestCorrect = signal(this.guest.counters.correct);
  readonly guestAnswered = signal(this.guest.counters.answered);
  readonly toasts = signal<Toast[]>([]);
  readonly pulse = signal<{ correct: boolean; xp: number; at: number } | null>(null);
  readonly guestImportFailed = signal(false);

  readonly combo = computed(() => this.progress()?.combo ?? this.guestCombo());
  readonly levelProgress = computed(() => {
    const xp = this.progress()?.totalXp ?? 0;
    return (xp % 100) / 100;
  });

  constructor() {
    effect(() => {
      const status = this.session.status();
      if (status === 'loading' || status === 'unavailable') return;
      const owner = this.session.user()?.id ?? null;
      untracked(() => {
        if (owner === this.owner) return;
        this.owner = owner;
        this.controller.abort();
        this.controller = new AbortController();
        this.progress.set(null);
        this.transfer = null;
        this.guestImportFailed.set(false);
        this.refreshGuestCounters();
        this.toasts.set([]);
        if (owner) void this.load();
      });
    });
  }

  async load(): Promise<void> {
    const signal = this.controller.signal;
    try {
      const transfer = this.syncGuestAnswers();
      if (transfer) await transfer;
      if (signal.aborted) return;
      const progress = await this.api.get<Progress>('/progress', signal);
      if (!signal.aborted) this.update(progress, false);
    } catch {
    }
  }

  syncGuestAnswers(): Promise<void> | undefined {
    const accountId = this.session.user()?.id;
    if (this.session.status() !== 'authenticated' || !accountId || accountId !== this.owner) return;
    if (this.transfer?.accountId === accountId) return this.transfer.task;
    if (this.guestImportFailed()) return;

    let batch: GuestImport | undefined;
    try {
      batch = this.guest.beginImport(accountId);
    } catch {
      this.guestImportFailed.set(true);
      return;
    }
    if (!batch) return;

    const signal = this.controller.signal;
    const task = this.importGuestAnswers(accountId, signal, batch).finally(() => {
      if (this.transfer?.task === task) this.transfer = null;
    });
    this.transfer = { accountId, task };
    return task;
  }

  retryGuestAnswers(): void {
    if (this.session.status() !== 'authenticated') return;
    this.guestImportFailed.set(false);
    void this.load();
  }

  private async importGuestAnswers(
    accountId: string,
    signal: AbortSignal,
    first: GuestImport,
  ): Promise<void> {
    try {
      let batch: GuestImport | undefined = first;
      while (batch && !signal.aborted && this.session.user()?.id === accountId) {
        this.refreshGuestCounters();
        const result = await this.api.send<{ progress: Progress }>(
          '/guest-answers',
          'POST',
          { accountId, ...batch },
          signal,
        );
        if (signal.aborted || this.session.user()?.id !== accountId) return;
        this.guest.finishImport(accountId, batch.requestId);
        this.update(result.progress, false);
        batch = this.guest.beginImport(accountId);
      }
    } catch {
      if (!signal.aborted && this.session.user()?.id === accountId) this.guestImportFailed.set(true);
    }
  }

  private refreshGuestCounters(): void {
    const { combo, correct, answered } = this.guest.counters;
    this.guestCombo.set(combo);
    this.guestCorrect.set(correct);
    this.guestAnswered.set(answered);
  }

  applyTap(result: TapResult): void {
    this.pulse.set({ correct: result.correct, xp: result.xpAwarded, at: Date.now() });
    if (result.progress) {
      this.update(result.progress, true);
      return;
    }
    this.guest.record(result);
    this.guestAnswered.update((count) => count + 1);
    if (result.correct) {
      this.guestCorrect.update((count) => count + 1);
      this.guestCombo.update((combo) => combo + 1);
      if (COMBO_MILESTONES.has(this.guestCombo()))
        this.toast({ kind: 'combo', combo: this.guestCombo() });
    } else this.guestCombo.set(0);
  }

  async refreshAfterAssessment(): Promise<void> {
    const signal = this.controller.signal;
    try {
      const progress = await this.api.get<Progress>('/progress', signal);
      if (!signal.aborted) this.update(progress, true);
    } catch {
    }
  }

  toast(toast: ToastInput): void {
    const id = this.nextToast++;
    this.toasts.update((toasts) => [...toasts.slice(-2), { ...toast, id } as Toast]);
    setTimeout(() => this.dismiss(id), 3200);
  }

  dismiss(id: number): void {
    this.toasts.update((toasts) => toasts.filter((toast) => toast.id !== id));
  }

  private update(next: Progress, celebrate: boolean): void {
    const previous = this.progress();
    this.progress.set(next);
    if (!celebrate || !previous) return;
    if (next.level > previous.level) this.toast({ kind: 'level', level: next.level });
    const earned = new Set(previous.achievements.filter((badge) => badge.earned).map((b) => b.id));
    for (const badge of next.achievements)
      if (badge.earned && !earned.has(badge.id)) this.toast({ kind: 'badge', badge: badge.id });
    if (next.combo > previous.combo && COMBO_MILESTONES.has(next.combo))
      this.toast({ kind: 'combo', combo: next.combo });
    if (previous.dailyCompleted < previous.dailyGoal && next.dailyCompleted >= next.dailyGoal)
      this.toast({ kind: 'goal' });
  }
}
