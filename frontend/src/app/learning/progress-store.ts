import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { AuthSession } from '../auth/auth-session';
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
  private owner: string | null | undefined;
  private controller = new AbortController();
  private nextToast = 1;
  readonly progress = signal<Progress | null>(null);
  readonly guestCombo = signal(0);
  readonly guestCorrect = signal(0);
  readonly guestAnswered = signal(0);
  readonly toasts = signal<Toast[]>([]);
  readonly pulse = signal<{ correct: boolean; xp: number; at: number } | null>(null);

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
        this.guestCombo.set(0);
        this.guestCorrect.set(0);
        this.guestAnswered.set(0);
        this.toasts.set([]);
        if (owner) void this.load();
      });
    });
  }

  async load(): Promise<void> {
    const signal = this.controller.signal;
    try {
      const progress = await this.api.get<Progress>('/progress', signal);
      if (!signal.aborted) this.update(progress, false);
    } catch {
    }
  }

  applyTap(result: TapResult): void {
    this.pulse.set({ correct: result.correct, xp: result.xpAwarded, at: Date.now() });
    if (result.progress) {
      this.update(result.progress, true);
      return;
    }
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
