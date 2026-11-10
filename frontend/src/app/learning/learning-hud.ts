import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthSession } from '../auth/auth-session';
import { Icon } from './icon';
import { ProgressStore, type Toast } from './progress-store';
import type { Language } from './learning.types';

const BADGES: Record<string, { icon: string; ja: string; en: string }> = {
  'first-correct-tap': { icon: 'target', ja: 'はじめての正解', en: 'First correct answer' },
  'first-pass': { icon: 'lightbulb', ja: 'はじめての合格', en: 'First understanding' },
  'combo-five': { icon: 'flame', ja: '5連続正解', en: 'Five in a row' },
  'combo-ten': { icon: 'bolt', ja: '10連続正解', en: 'Ten in a row' },
  'ten-passes': { icon: 'book', ja: '10問を理解', en: 'Ten questions understood' },
  'fifty-correct': { icon: 'medal', ja: '50問正解', en: 'Fifty correct answers' },
  'three-day-streak': { icon: 'calendar', ja: '3日連続で学習', en: 'Three-day learner' },
  'seven-day-streak': { icon: 'calendar-check', ja: '7日連続で学習', en: 'Seven-day learner' },
  'daily-solver': { icon: 'bug', ja: '今日のバグを解決', en: 'Bug of the Day solver' },
  'first-post': { icon: 'pencil', ja: 'はじめての投稿', en: 'First community question' },
};

export function badgeInfo(id: string, language: Language): { icon: string; name: string } {
  const badge = BADGES[id];
  return badge ? { icon: badge.icon, name: badge[language] } : { icon: 'rank', name: id };
}

@Component({
  selector: 'app-learning-hud',
  imports: [RouterLink, Icon],
  template: `
    <div class="hud" [attr.aria-label]="text('学習の進み具合', 'Learning progress')" role="group">
      @if (store.progress(); as progress) {
        <span
          class="chip streak"
          [class.lit]="progress.streak > 0"
          [attr.title]="text('連続学習日数', 'Day streak')"
        >
          @for (streak of [progress.streak]; track streak) {
            <app-icon class="flame" name="flame" [filled]="true" />{{ streak }}
          }
          <span class="sr-only">{{ text('日連続', ' day streak') }}</span>
        </span>
        <span class="chip goal" [attr.title]="text('今日の目標', 'Today’s goal')">
          <svg viewBox="0 0 36 36" aria-hidden="true">
            <circle class="track" cx="18" cy="18" r="15" />
            <circle
              class="fill"
              cx="18"
              cy="18"
              r="15"
              [style.stroke-dashoffset]="94.25 * (1 - goalRatio())"
            />
          </svg>
          {{ progress.dailyCompleted }}/{{ progress.dailyGoal }}
          <span class="sr-only">{{ text('今日の目標', 'today’s goal') }}</span>
        </span>
        <span class="chip level" [attr.title]="progress.totalXp + ' XP'">
          Lv {{ progress.level }}
          <span class="bar" aria-hidden="true"
            ><span [style.transform]="'scaleX(' + store.levelProgress() + ')'"></span
          ></span>
        </span>
      } @else if (session.status() === 'guest') {
        <span
          class="chip"
          [attr.title]="text('正解数 / 回答数', 'Correct answers / questions answered')"
        >
          <app-icon name="check" />{{ store.guestCorrect() }}/{{ store.guestAnswered() }}
          <span class="sr-only">{{ text('正解', 'correct out of answered') }}</span>
        </span>
        <a class="chip signin" routerLink="/login" [queryParams]="{ reason: 'progress' }">{{
          text('ログインして記録', 'Sign in to save')
        }}</a>
      }
      @if (store.combo() >= 2) {
        @for (combo of [store.combo()]; track combo) {
          <span
            class="chip combo"
            [class.hot]="combo >= 5"
            aria-live="polite"
            [attr.title]="text('連続正解', 'Correct answers in a row')"
            >×{{ combo }} <span class="combo-label">{{ text('コンボ', 'combo') }}</span></span
          >
        }
      }
    </div>
    <div class="toasts" aria-live="polite">
      @for (toast of store.toasts(); track toast.id) {
        <button
          type="button"
          [class]="'toast toast-' + toast.kind"
          animate.leave="toast-leave"
          (click)="store.dismiss(toast.id)"
        >
          <app-icon [name]="toastIcon(toast)" [filled]="toast.kind === 'combo'" />
          <span>{{ toastText(toast) }}</span>
          @if (celebrates(toast)) {
            <span class="confetti" aria-hidden="true">
              @for (piece of confetti; track $index) {
                <i
                  [style.--x.px]="piece.x"
                  [style.--y.px]="piece.y"
                  [style.--r.deg]="piece.r"
                  [style.--d.ms]="piece.delay"
                  [style.background]="piece.color"
                ></i>
              }
            </span>
          }
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: contents;
    }
    .hud {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      flex-wrap: wrap;
      justify-content: center;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      flex-shrink: 0;
      min-height: 32px;
      padding: 4px 10px;
      border-radius: 999px;
      background: var(--control);
      color: var(--text);
      font-size: 0.8125rem;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      text-decoration: none;
      white-space: nowrap;
    }
    .chip app-icon {
      width: 16px;
      height: 16px;
    }
    .streak .flame {
      color: var(--muted);
      opacity: 0.7;
    }
    .streak.lit .flame {
      color: var(--flame);
      opacity: 1;
      animation: flare 420ms var(--ease-spring);
    }
    .goal svg {
      width: 18px;
      height: 18px;
      transform: rotate(-90deg);
    }
    .goal circle {
      fill: none;
      stroke-width: 5;
    }
    .goal .track {
      stroke: var(--border);
    }
    .goal .fill {
      stroke: var(--accent);
      stroke-linecap: round;
      stroke-dasharray: 94.25;
      transition: stroke-dashoffset 400ms var(--ease-out);
    }
    .bar {
      display: inline-block;
      width: 36px;
      height: 6px;
      overflow: hidden;
      border-radius: 999px;
      background: var(--border);
    }
    .bar span {
      display: block;
      height: 100%;
      background: var(--accent);
      transform-origin: left;
      transition: transform 400ms var(--ease-out);
    }
    .signin {
      color: var(--accent);
      min-height: 48px;
    }
    .combo {
      background: var(--accent);
      color: var(--canvas);
      animation: bump 240ms var(--ease-spring);
    }
    .combo.hot {
      font-weight: 700;
    }
    .toasts {
      position: fixed;
      top: calc(72px + env(safe-area-inset-top, 0px));
      left: 50%;
      z-index: 30;
      display: grid;
      gap: 8px;
      justify-items: center;
      width: min(92vw, 420px);
      transform: translateX(-50%);
      pointer-events: none;
    }
    .toast {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      pointer-events: auto;
      min-height: 48px;
      padding: 10px 18px;
      border: 0;
      border-radius: 999px;
      background: var(--button-bg);
      color: var(--button-text);
      font-weight: 700;
      font-size: 0.875rem;
      box-shadow: 0 10px 30px rgb(0 0 0 / 35%);
      position: relative;
      animation: drop 240ms var(--ease-out);
    }
    .toast-leave {
      animation: lift 160ms var(--ease-out) forwards;
    }
    .confetti {
      position: absolute;
      left: 50%;
      top: 50%;
      pointer-events: none;
    }
    .confetti i {
      position: absolute;
      width: 7px;
      height: 11px;
      border-radius: 2px;
      opacity: 0;
      animation: burst 720ms var(--ease-out) var(--d) forwards;
    }
    .toast-level,
    .toast-goal,
    .toast-combo {
      background: var(--accent);
      color: var(--canvas);
    }
    @media (max-width: 420px) {
      .combo-label,
      .level .bar {
        display: none;
      }
      .chip {
        padding-inline: 6px;
        font-size: 0.75rem;
        gap: 3px;
      }
    }
    @keyframes flare {
      from {
        transform: scale(0.8) rotate(-8deg);
      }
    }
    @keyframes bump {
      from {
        opacity: 0.6;
        transform: scale(0.9);
      }
    }
    @keyframes drop {
      from {
        opacity: 0;
        transform: translateY(-8px) scale(0.96);
      }
    }
    @keyframes lift {
      to {
        opacity: 0;
        transform: translateY(-6px) scale(0.98);
      }
    }
    @keyframes burst {
      15% {
        opacity: 1;
      }
      to {
        opacity: 0;
        transform: translate(var(--x), var(--y)) rotate(var(--r));
      }
    }
    @keyframes fade {
      from {
        opacity: 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .streak.lit .flame,
      .combo {
        animation: none;
      }
      .toast {
        animation-name: fade;
      }
      .toast-leave {
        animation: lift 160ms ease forwards;
      }
      .confetti {
        display: none;
      }
    }
  `,
})
export class LearningHud {
  readonly language = input<Language>('ja');
  protected readonly store = inject(ProgressStore);
  protected readonly session = inject(AuthSession);
  protected readonly goalRatio = computed(() => {
    const progress = this.store.progress();
    return progress ? Math.min(1, progress.dailyCompleted / progress.dailyGoal) : 0;
  });

  protected readonly confetti = Array.from({ length: 14 }, (_, index) => {
    const angle = (index / 14) * Math.PI * 2 + (index % 2) * 0.3;
    const distance = 70 + (index % 3) * 26;
    return {
      x: Math.round(Math.cos(angle) * distance),
      y: Math.round(Math.sin(angle) * distance * 0.7 + 30),
      r: (index * 47) % 360,
      delay: (index % 4) * 20,
      color: ['var(--accent)', '#ff9f43', '#ff4d6d', '#5ec8ff'][index % 4],
    };
  });

  protected celebrates(toast: Toast): boolean {
    return (
      toast.kind === 'level' ||
      toast.kind === 'goal' ||
      (toast.kind === 'combo' && toast.combo >= 10)
    );
  }

  protected text(ja: string, en: string): string {
    return this.language() === 'ja' ? ja : en;
  }

  protected toastIcon(toast: Toast): string {
    switch (toast.kind) {
      case 'level':
        return 'star';
      case 'badge':
        return badgeInfo(toast.badge, this.language()).icon;
      case 'combo':
        return 'flame';
      case 'goal':
        return 'check-circle';
      case 'difficulty':
        return toast.direction === 'up' ? 'bolt' : 'leaf';
    }
  }

  protected toastText(toast: Toast): string {
    switch (toast.kind) {
      case 'level':
        return this.text(`レベル${toast.level}にアップ！`, `Level ${toast.level} unlocked!`);
      case 'badge': {
        const badge = badgeInfo(toast.badge, this.language());
        return `${this.text('実績を獲得：', 'Badge earned: ')}${badge.name}`;
      }
      case 'combo':
        return this.text(`${toast.combo}連続正解！`, `${toast.combo} in a row!`);
      case 'goal':
        return this.text('今日の目標を達成！', 'Daily goal complete!');
      case 'difficulty':
        return toast.direction === 'up'
          ? this.text('好調！問題のレベルを上げます', 'On fire! Questions are getting harder')
          : this.text('少しやさしい問題で基礎を固めます', 'Easing off to rebuild the basics');
    }
  }
}
