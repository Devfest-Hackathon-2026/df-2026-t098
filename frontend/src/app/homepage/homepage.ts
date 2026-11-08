import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthSession } from '../auth/auth-session';
import { DisplaySettings } from '../learning/display-settings';
import { LearningApi, learningError } from '../learning/learning-api';
import { Icon } from '../learning/icon';
import { QuestionCard } from '../learning/question-card';
import { ProfilePanel } from '../learning/profile-panel';
import { LeaderboardPanel } from '../learning/leaderboard-panel';
import { PublishQuestion } from '../learning/publish-question';
import { LoadingSkeleton } from '../learning/loading-skeleton';
import { LearningHud } from '../learning/learning-hud';
import { FeedStore, type FeedItem } from '../learning/feed-store';
import { topicLabel } from '../learning/topic-label';
import type { Question, TapResult } from '../learning/learning.types';

type Tab = 'feed' | 'review' | 'rank' | 'publish' | 'profile';

@Component({
  selector: 'app-homepage',
  imports: [
    RouterLink,
    Icon,
    QuestionCard,
    ProfilePanel,
    LeaderboardPanel,
    PublishQuestion,
    LoadingSkeleton,
    LearningHud,
  ],
  templateUrl: './homepage.html',
  styleUrl: './homepage.css',
  host: { '(document:keydown)': 'onKeydown($event)' },
})
export class Homepage {
  protected readonly settings = inject(DisplaySettings);
  protected readonly authSession = inject(AuthSession);
  protected readonly feed = inject(FeedStore);
  private readonly api = inject(LearningApi);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly content = viewChild.required<ElementRef<HTMLElement>>('content');
  private controller = new AbortController();
  private reviewsOwner: string | null | undefined;
  private scrollFrame = 0;
  protected readonly tabs: Tab[] = ['feed', 'review', 'rank', 'publish', 'profile'];
  protected readonly tab = signal<Tab>('feed');
  protected readonly discussionQuestion = signal<string | null>(null);
  protected readonly reviews = signal<Question[]>([]);
  protected readonly reviewsLoading = signal(false);
  protected readonly reviewsError = signal('');

  constructor() {
    const destroy = inject(DestroyRef);
    destroy.onDestroy(() => {
      this.controller.abort();
      this.feed.scrollTop = this.content().nativeElement.scrollTop;
      this.feed.pruneHandler = null;
      cancelAnimationFrame(this.scrollFrame);
    });
    effect(() => {
      this.authSession.status();
      this.authSession.user();
      this.settings.language();
      this.feed.sync();
    });
    effect(() => {
      const status = this.authSession.status();
      const owner = this.authSession.user()?.id ?? null;
      if (status === 'loading' || owner === this.reviewsOwner) return;
      this.reviewsOwner = owner;
      this.controller.abort();
      this.controller = new AbortController();
      this.reviews.set([]);
      this.reviewsError.set('');
      this.reviewsLoading.set(false);
      this.discussionQuestion.set(null);
      if (this.tab() === 'review') void this.loadReviews();
    });
    this.feed.pruneHandler = (removed, apply) => this.keepPosition(removed, apply);
    // Return to the same card after visiting another tab or page.
    afterNextRender(() => {
      const content = this.content().nativeElement;
      if (this.feed.scrollTop) content.scrollTop = this.feed.scrollTop;
    });
  }

  protected text(ja: string, en: string): string {
    return this.settings.language() === 'ja' ? ja : en;
  }
  protected label(tab: Tab): string {
    return {
      feed: this.text('フィード', 'Feed'),
      review: this.text('復習', 'Practice'),
      rank: this.text('ランキング', 'Ranking'),
      publish: this.text('投稿', 'Post'),
      profile: this.text('プロフィール', 'Profile'),
    }[tab];
  }
  protected topics(question: Question): string {
    return question.topics
      .filter((topic) => topic !== 'general')
      .slice(0, 3)
      .map((topic) => topicLabel(topic, this.settings.language()))
      .join(' · ');
  }

  protected openTab(tab: Tab, content: HTMLElement): void {
    if (this.tab() === tab) {
      // Tapping Feed again jumps back to the current card, like a home button.
      if (tab === 'feed') this.scrollToIndex(this.feed.activeIndex());
      return;
    }
    if (this.tab() === 'feed') this.feed.scrollTop = content.scrollTop;
    this.tab.set(tab);
    this.discussionQuestion.set(null);
    if (tab === 'feed')
      afterNextRender(() => (content.scrollTop = this.feed.scrollTop), {
        injector: this.injector,
      });
    else content.scrollTop = 0;
    if (tab === 'review') void this.loadReviews();
  }

  protected async loadReviews(): Promise<void> {
    if (this.reviewsLoading() || this.authSession.status() !== 'authenticated') return;
    const signal = this.controller.signal;
    this.reviewsLoading.set(true);
    this.reviewsError.set('');
    try {
      const result = await this.api.get<{ questions: Question[] }>('/reviews', signal);
      if (!signal.aborted) this.reviews.set(result.questions);
    } catch (error) {
      if (!signal.aborted) this.reviewsError.set(learningError(error, this.settings.language()));
    } finally {
      if (!signal.aborted) this.reviewsLoading.set(false);
    }
  }

  protected onScroll(content: HTMLElement): void {
    if (this.tab() !== 'feed') return;
    cancelAnimationFrame(this.scrollFrame);
    this.scrollFrame = requestAnimationFrame(() => {
      const top = content.getBoundingClientRect().top + content.clientHeight * 0.35;
      const slides = content.querySelectorAll<HTMLElement>('.feed-slide');
      let active = 0;
      slides.forEach((slide, index) => {
        if (slide.getBoundingClientRect().top <= top) active = index;
      });
      const item = this.feed.items()[active];
      if (
        active !== this.feed.activeIndex() &&
        (item?.kind !== 'question' || this.discussionQuestion() !== item.key)
      )
        this.discussionQuestion.set(null);
      this.feed.scrollTop = content.scrollTop;
      if (active !== this.feed.activeIndex() || active === 0) this.feed.setActive(active);
    });
  }

  /**
   * Keyboard: ↓/↑ (or j/k) move between cards and 1–4 answer the current one. Keyboard
   * actions jump instantly; animating them would only add delay.
   */
  protected onKeydown(event: KeyboardEvent): void {
    if (this.tab() !== 'feed' || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable], dialog[open]')) return;
    const index = this.feed.activeIndex();
    if (['ArrowDown', 'PageDown', 'j'].includes(event.key)) {
      event.preventDefault();
      this.scrollToIndex(index + 1, 'auto');
    } else if (['ArrowUp', 'PageUp', 'k'].includes(event.key)) {
      event.preventDefault();
      this.scrollToIndex(Math.max(0, index - 1), 'auto');
    } else if (/^[1-4]$/.test(event.key) && !target?.closest('.quiz-options')) {
      const slide =
        this.content().nativeElement.querySelectorAll<HTMLElement>('.feed-slide')[index];
      const choices = slide?.querySelectorAll<HTMLButtonElement>(
        '.quiz-option:not(:disabled), button.code-line:not(:disabled)',
      );
      const choice = choices?.[Number(event.key) - 1];
      if (choice) {
        event.preventDefault();
        choice.click();
      }
    }
  }

  protected onTapped(item: FeedItem, result: TapResult): void {
    this.feed.tapped(item, result);
  }

  protected next(index: number): void {
    this.scrollToIndex(index + 1);
  }

  private scrollToIndex(index: number, behavior?: ScrollBehavior): void {
    const slide = this.content().nativeElement.querySelectorAll<HTMLElement>('.feed-slide')[index];
    const reduce = this.document.defaultView?.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    slide?.scrollIntoView({ behavior: behavior ?? (reduce ? 'auto' : 'smooth'), block: 'start' });
  }

  /** Keep the current card fixed on screen while cards far above it are dropped. */
  private keepPosition(removed: number, apply: () => void): void {
    const content = this.content().nativeElement;
    const anchor = content.querySelectorAll<HTMLElement>('.feed-slide')[removed];
    const removedHeight = anchor
      ? anchor.getBoundingClientRect().top - content.getBoundingClientRect().top + content.scrollTop
      : 0;
    const oldScroll = content.scrollTop;
    apply();
    afterNextRender(() => (content.scrollTop = Math.max(0, oldScroll - removedHeight)), {
      injector: this.injector,
    });
  }

  protected setDiscussion(questionId: string, open: boolean): void {
    if (open) this.discussionQuestion.set(questionId);
    else if (this.discussionQuestion() === questionId) this.discussionQuestion.set(null);
  }

  protected editInterests(): void {
    this.feed.restart();
  }
}
