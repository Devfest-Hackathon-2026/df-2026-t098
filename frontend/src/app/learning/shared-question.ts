import { Component, computed, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthSession } from '../auth/auth-session';
import { DisplaySettings } from './display-settings';
import { LearningApi, learningError } from './learning-api';
import { QuestionCard } from './question-card';
import { LoadingSkeleton } from './loading-skeleton';
import { ProgressStore } from './progress-store';
import type { Question } from './learning.types';

@Component({
  selector: 'app-shared-question',
  imports: [RouterLink, QuestionCard, LoadingSkeleton],
  host: { '[class.has-discussion]': 'discussion()' },
  template: `<main class="shared-question">
    <header>
      <a routerLink="/">{{ text('フィードに戻る', 'Back to the feed') }}</a>
    </header>
    @if (session.status() === 'unavailable') {
      <p role="alert">
        {{
          text(
            'アカウントを確認できませんでした。接続を確認して再試行してください。',
            'Could not check your account. Check your connection and try again.'
          )
        }}
      </p>
      <button type="button" (click)="session.refresh()">{{ text('再試行', 'Try again') }}</button>
    }
    @if (loading() || (session.status() === 'loading' && !question())) {
      <app-loading-skeleton
        variant="question"
        [label]="text('問題を読み込み中…', 'Loading question…')"
      />
    }
    @if (question(); as question) {
      <app-question-card
        [question]="question"
        [language]="settings.language()"
        [explainOnOpen]="explainOnOpen()"
        [discussion]="discussion()"
        (discussionChange)="discussion.set($event)"
      />
    }
    @if (error()) {
      <p role="alert">{{ error() }}</p>
      <button type="button" (click)="load()">{{ text('再試行', 'Try again') }}</button>
    }
  </main>`,
  styles: [
    `
      :host {
        display: block;
        min-height: 100dvh;
      }
      .shared-question {
        max-width: 800px;
        margin: auto;
        padding: calc(20px + env(safe-area-inset-top, 0px))
          max(16px, env(safe-area-inset-right, 0px)) calc(32px + env(safe-area-inset-bottom, 0px))
          max(16px, env(safe-area-inset-left, 0px));
      }
      header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
        margin-bottom: 20px;
      }
      a {
        color: var(--accent);
        text-underline-offset: 4px;
        min-height: 48px;
        display: inline-flex;
        align-items: center;
      }
      button {
        min-height: 48px;
        padding: 10px 16px;
        background: var(--control);
        border: 1px solid var(--border);
        border-radius: 8px;
        color: var(--text);
      }
      @media (min-width: 1200px) {
        :host.has-discussion {
          padding-right: 360px;
        }
      }
    `,
  ],
})
export class SharedQuestion {
  protected readonly settings = inject(DisplaySettings);
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(LearningApi);
  private readonly progress = inject(ProgressStore);
  protected readonly session = inject(AuthSession);
  private controller = new AbortController();
  private readonly params = toSignal(this.route.paramMap, { requireSync: true });
  private readonly query = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly explainOnOpen = computed(
    () => this.query().get('explain') === '1' && this.session.status() === 'authenticated',
  );
  private identity = '';
  protected readonly question = signal<Question | null>(null);
  protected readonly discussion = signal(false);
  protected readonly error = signal('');
  protected readonly loading = signal(false);
  constructor() {
    inject(DestroyRef).onDestroy(() => this.controller.abort());
    effect(() => {
      const id = this.params().get('id');
      const status = this.session.status();
      if (status === 'loading' || status === 'unavailable') return;
      const identity = (this.session.user()?.id ?? 'guest') + ':' + id;
      untracked(() => {
        if (identity === this.identity) return;
        this.identity = identity;
        this.controller.abort();
        this.controller = new AbortController();
        this.question.set(null);
        this.discussion.set(false);
        this.loading.set(false);
        void this.load();
      });
    });
  }
  protected text(ja: string, en: string): string {
    return this.settings.language() === 'ja' ? ja : en;
  }
  protected async load(): Promise<void> {
    if (this.loading()) return;
    const signal = this.controller.signal;
    this.loading.set(true);
    this.error.set('');
    try {
      const transfer = this.progress.syncGuestAnswers();
      if (transfer) await transfer;
      if (signal.aborted) return;
      const id = this.route.snapshot.paramMap.get('id');
      const result = await this.api.get<{ question: Question }>(
        '/questions/' + encodeURIComponent(id ?? ''),
        signal,
      );
      if (!signal.aborted) this.question.set(result.question);
    } catch (error) {
      if (!signal.aborted) this.error.set(learningError(error, this.settings.language()));
    } finally {
      if (!signal.aborted) this.loading.set(false);
    }
  }
}
