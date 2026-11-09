import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { Icon } from './icon';
import { LoadingSkeleton } from './loading-skeleton';
import { AuthSession } from '../auth/auth-session';
import { LearningApi, learningError } from './learning-api';
import { FeedStore } from './feed-store';
import type { Language, Leaderboard } from './learning.types';

@Component({
  selector: 'app-leaderboard-panel',
  imports: [LoadingSkeleton, Icon],
  template: `<section class="panel">
    <h1>{{ text('今週のランキング', 'This week’s ranking') }}</h1>
    <p class="intro">
      {{
        text(
          '理解を積み重ねて、みんなと一緒に上を目指そう。',
          'Build your understanding and climb together.'
        )
      }}
    </p>
    <p class="hint">
      {{
        text(
          '月曜にリセット · 日本時間 · 問題ごとのXPは一度だけ獲得できます · 同点は先に達成した人が上位です。',
          'Resets Monday · Japan time · Each question awards XP once · Ties go to whoever got there first.'
        )
      }}
    </p>
    @if (feed.daily(); as daily) {
      @if (daily.question) {
        <section class="daily">
          <h2>
            <app-icon name="bug" aria-hidden="true" /> {{ text('今日のバグ', 'Bug of the Day') }}
          </h2>
          <p class="hint">
            {{
              text(
                daily.answered + '人が挑戦 · ' + daily.solved + '人が解決',
                daily.answered + ' tried · ' + daily.solved + ' solved'
              )
            }}
            @if (daily.you; as you) {
              ·
              <strong>{{
                you.correct
                  ? text('あなたは' + you.rank + '番目', 'You were #' + you.rank)
                  : text('明日リベンジ', 'Rematch tomorrow')
              }}</strong>
            }
          </p>
          <ol class="solvers">
            @for (solver of daily.solvers.slice(0, 5); track solver.user.id) {
              <li>
                <span class="place" [attr.data-place]="solver.rank">{{ solver.rank }}</span>
                {{ solver.user.displayName }}
              </li>
            } @empty {
              <li>{{ text('一番乗りを目指そう！', 'Be the first to solve it!') }}</li>
            }
          </ol>
        </section>
      }
    }
    @if (loading()) {
      <app-loading-skeleton [label]="text('ランキングを読み込み中…', 'Loading rankings…')" />
    }
    @if (ranking(); as ranking) {
      <ol class="ranking">
        @for (entry of ranking.entries; track entry.user.id) {
          <li [class.you]="entry.user.id === session.user()?.id">
            <span class="rank">{{ entry.rank }}</span>
            <strong
              >{{ entry.user.displayName }}
              @if (entry.user.id === session.user()?.id) {
                <small> {{ text('あなた', 'You') }}</small>
              }
            </strong>
            <span>{{ entry.xp }} XP</span>
          </li>
        } @empty {
          <li class="empty">
            {{
              text(
                '今週の学習はここから。最初の問題に挑戦しよう。',
                'A fresh week. Be the first to work through a question.'
              )
            }}
            <button class="signin-cta" type="button" (click)="startLearning.emit()">
              {{ text('問題に挑戦する', 'Start a question') }}
            </button>
          </li>
        }
      </ol>
    }
    @if (error()) {
      <p role="alert">{{ error() }}</p>
      <button class="secondary" type="button" (click)="load()">
        {{ text('再試行', 'Try again') }}
      </button>
    }
  </section>`,
  styleUrls: ['./learning-panels.css'],
  styles: [
    `
      li.empty {
        display: grid;
        justify-items: start;
        gap: 4px;
      }
      .daily {
        margin: 24px 0 8px;
        padding: 16px 18px;
        border-radius: 16px;
        border: 1.5px solid var(--accent);
      }
      .daily h2 {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 0 0 4px;
        font-size: 1.125rem;
      }
      .daily h2 app-icon {
        color: var(--accent);
      }
      .place {
        display: inline-grid;
        place-items: center;
        width: 20px;
        height: 20px;
        margin-right: 4px;
        border-radius: 50%;
        background: var(--border);
        color: var(--text);
        font-size: 0.6875rem;
        font-weight: 700;
      }
      .place[data-place='1'] {
        background: #e8b923;
        color: #231a00;
      }
      .place[data-place='2'] {
        background: #b8bcc4;
        color: #1c1f24;
      }
      .place[data-place='3'] {
        background: #c98a52;
        color: #261405;
      }
      .solvers {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 12px 0 0;
        padding: 0;
        list-style: none;
        font-size: 0.8125rem;
      }
      .solvers li {
        padding: 4px 10px;
        border-radius: 999px;
        background: var(--control);
      }
      .ranking {
        list-style: none;
        padding: 0;
        margin: 28px 0;
      }
      .ranking li {
        display: flex;
        align-items: center;
        gap: 16px;
        min-height: 72px;
        border-bottom: 1px solid var(--border);
        font-variant-numeric: tabular-nums;
      }
      .rank {
        width: 28px;
        color: var(--muted);
      }
      .ranking strong {
        flex: 1;
        min-width: 0;
        font-size: 0.9375rem;
        overflow-wrap: anywhere;
      }
      .ranking li > span:last-child {
        white-space: nowrap;
        font-size: 0.8125rem;
      }
      .ranking small {
        color: var(--muted);
        font-size: 0.6875rem;
        font-weight: 400;
      }
      .ranking .you {
        color: var(--accent);
      }
    `,
  ],
})
export class LeaderboardPanel {
  readonly language = input<Language>('ja');
  readonly startLearning = output<void>();
  protected readonly session = inject(AuthSession);
  protected readonly feed = inject(FeedStore);
  private readonly api = inject(LearningApi);
  private readonly controller = new AbortController();
  protected readonly ranking = signal<Leaderboard | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  constructor() {
    inject(DestroyRef).onDestroy(() => this.controller.abort());
    void this.load();
  }
  protected text(ja: string, en: string): string {
    return this.language() === 'ja' ? ja : en;
  }
  protected async load(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    try {
      const ranking = await this.api.get<Leaderboard>('/leaderboard', this.controller.signal);
      if (!this.controller.signal.aborted) this.ranking.set(ranking);
    } catch (error) {
      if (!this.controller.signal.aborted) this.error.set(learningError(error, this.language()));
    } finally {
      if (!this.controller.signal.aborted) this.loading.set(false);
    }
  }
}
