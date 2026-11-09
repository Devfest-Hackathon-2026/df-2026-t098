import { Brand } from '../brand/brand';
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

type Tab = 'feed' | 'review' | 'rank' | 'publish' | 'profile' | 'settings';

@Component({
  selector: 'app-homepage',
  imports: [
    Brand,
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
  private settleFrame = 0;
  private stageFrame = 0;
  private swipe: {
    id: number;
    x: number;
    y: number;
    started: number;
    index: number;
    origin: number;
    dragging: boolean;
    stage: HTMLElement | null;
    stageOrigin: number;
    mode: 'page' | 'stage' | null;
    lastY: number;
    lastTime: number;
    velocity: number;
  } | null = null;
  private suppressSwipeClick = false;
  protected readonly tabs: Tab[] = ['feed', 'review', 'rank', 'publish', 'profile', 'settings'];
  protected readonly tab = signal<Tab>('feed');
  protected readonly discussionQuestion = signal<string | null>(null);
  protected readonly reviews = signal<Question[]>([]);
  protected readonly reviewsLoading = signal(false);
  protected readonly reviewsError = signal('');

  constructor() {
    const destroy = inject(DestroyRef);
    destroy.onDestroy(() => {
      this.controller.abort();
      if (this.tab() === 'feed') this.feed.scrollTop = this.content().nativeElement.scrollTop;
      this.feed.pruneHandler = null;
      cancelAnimationFrame(this.scrollFrame);
      cancelAnimationFrame(this.settleFrame);
      cancelAnimationFrame(this.stageFrame);
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
    afterNextRender(() => {
      const content = this.content().nativeElement;
      const align = () => {
        this.swipe = null;
        this.stopSettle();
        content.classList.remove('is-paging');
        content.style.setProperty('--feed-slide-height', `${content.clientHeight}px`);
        if (this.tab() === 'feed' && this.compactFeed()) {
          this.scrollToIndex(this.feed.activeIndex(), 'auto');
        }
      };
      align();
      if (this.feed.scrollTop && !this.compactFeed()) content.scrollTop = this.feed.scrollTop;
      const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(align) : null;
      observer?.observe(content);
      const suppressClick = (event: MouseEvent) => {
        if (!this.suppressSwipeClick || event.detail === 0) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.suppressSwipeClick = false;
      };
      content.addEventListener('click', suppressClick, true);
      // Keep drag events outside Angular change detection.
      const listeners: [string, EventListener][] = [
        ['scroll', () => this.onScroll(content)],
        ['pointerdown', (event) => this.onPointerDown(event as PointerEvent)],
        ['pointermove', (event) => this.onPointerMove(event as PointerEvent)],
        ['pointerup', (event) => this.onPointerUp(event as PointerEvent)],
        ['pointercancel', () => this.cancelSwipe()],
      ];
      for (const [type, listener] of listeners)
        content.addEventListener(type, listener, { passive: true });
      destroy.onDestroy(() => {
        observer?.disconnect();
        content.removeEventListener('click', suppressClick, true);
        for (const [type, listener] of listeners) content.removeEventListener(type, listener);
      });
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
      settings: this.text('設定', 'Settings'),
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
    const previous = this.tab();
    if (previous === tab) {
      if (tab === 'feed') this.scrollToIndex(this.feed.activeIndex());
      return;
    }
    if (this.tab() === 'feed') this.feed.scrollTop = content.scrollTop;
    cancelAnimationFrame(this.scrollFrame);
    this.swipe = null;
    this.stopSettle();
    content.classList.remove('is-paging');
    this.tab.set(tab);
    this.discussionQuestion.set(null);
    if (tab === 'feed')
      afterNextRender(
        () => {
          if (this.compactFeed()) this.scrollToIndex(this.feed.activeIndex(), 'auto');
          else content.scrollTop = this.feed.scrollTop;
        },
        {
          injector: this.injector,
        },
      );
    else {
      content.scrollTop = 0;
      if (tab === 'settings' || (tab === 'profile' && previous === 'settings')) {
        afterNextRender(() => {
          const gear = content.querySelector<HTMLButtonElement>('.profile-gear');
          const target = gear?.getClientRects().length ? gear : content.querySelector('h1');
          target?.focus({ preventScroll: true });
        }, { injector: this.injector });
      }
    }
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
      if (this.tab() !== 'feed' || this.swipe?.dragging || this.settleFrame) return;
      this.syncActive(content);
    });
  }

  private syncActive(content: HTMLElement): void {
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
      this.setDiscussionQuestion(null);
    this.feed.scrollTop = content.scrollTop;
    if (active !== this.feed.activeIndex() || active === 0) this.feed.setActive(active);
  }

  private compactFeed(): boolean {
    return this.document.defaultView?.matchMedia('(max-width: 959px)').matches ?? false;
  }

  private nearestSlide(content: HTMLElement): { index: number; offset: number } {
    const top = content.getBoundingClientRect().top;
    let index = this.feed.activeIndex();
    let offset = Infinity;
    content.querySelectorAll<HTMLElement>('.feed-slide').forEach((slide, current) => {
      const distance = Math.abs(slide.getBoundingClientRect().top - top);
      if (distance < offset) {
        offset = distance;
        index = current;
      }
    });
    return { index, offset: Number.isFinite(offset) ? offset : 0 };
  }

  private onPointerDown(event: PointerEvent): void {
    this.suppressSwipeClick = false;
    if (!event.isPrimary) {
      this.cancelSwipe();
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    if (
      (event.pointerType !== 'touch' && event.pointerType !== 'pen') ||
      this.tab() !== 'feed' ||
      !this.compactFeed() ||
      this.document.querySelector('dialog[open]') ||
      target?.closest('input, textarea, select, [contenteditable]')
    ) {
      this.swipe = null;
      return;
    }
    const content = this.content().nativeElement;
    const interrupted = this.stopSettle();
    cancelAnimationFrame(this.stageFrame);
    this.stageFrame = 0;
    const { index } = this.nearestSlide(content);
    if (interrupted && index !== this.feed.activeIndex()) this.feed.setActive(index);
    const stage = target?.closest<HTMLElement>('.question-content') ?? null;
    const scrollable = !!stage && stage.scrollHeight > stage.clientHeight + 1;
    this.swipe = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      started: event.timeStamp,
      index,
      origin: content.scrollTop,
      dragging: false,
      stage: scrollable ? stage : null,
      stageOrigin: scrollable ? stage.scrollTop : 0,
      mode: null,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      velocity: 0,
    };
  }

  private onPointerMove(event: PointerEvent): void {
    const swipe = this.swipe;
    if (!swipe || swipe.id !== event.pointerId) return;
    const distance = swipe.y - event.clientY;
    const vertical = Math.abs(distance);
    const horizontal = Math.abs(event.clientX - swipe.x);
    const content = this.content().nativeElement;
    if (!swipe.dragging) {
      // A vertical swipe can start sideways. Let it build before paging.
      if (vertical < 10 || vertical < horizontal * 0.5) return;
      swipe.dragging = true;
      this.suppressSwipeClick = true;
      const stage = swipe.stage;
      const room = stage
        ? distance > 0
          ? stage.scrollHeight - stage.clientHeight - stage.scrollTop > 1
          : stage.scrollTop > 1
        : false;
      swipe.mode = room ? 'stage' : 'page';
      if (swipe.mode === 'page') content.classList.add('is-paging');
    }
    const elapsed = event.timeStamp - swipe.lastTime;
    if (elapsed > 0) {
      const velocity = (swipe.lastY - event.clientY) / elapsed;
      swipe.velocity = swipe.velocity * 0.3 + velocity * 0.7;
      swipe.lastY = event.clientY;
      swipe.lastTime = event.timeStamp;
    }
    if (swipe.mode === 'stage' && swipe.stage) {
      swipe.stage.scrollTop = swipe.stageOrigin + distance;
      return;
    }
    const limit = content.clientHeight;
    content.scrollTop = swipe.origin + Math.max(-limit, Math.min(limit, distance));
  }

  private onPointerUp(event: PointerEvent): void {
    const swipe = this.swipe;
    this.swipe = null;
    const content = this.content().nativeElement;
    content.classList.remove('is-paging');
    if (!swipe || swipe.id !== event.pointerId) return;
    if (!swipe.dragging) {
      if (this.nearestSlide(content).offset > 1) this.scrollToIndex(swipe.index);
      return;
    }
    this.suppressSwipeClick = true;
    const distance = swipe.y - event.clientY;
    const vertical = Math.abs(distance);
    const horizontal = Math.abs(event.clientX - swipe.x);
    const average = vertical / Math.max(1, event.timeStamp - swipe.started);
    const speed = Math.max(Math.abs(swipe.velocity), average * 0.5);
    if (swipe.mode === 'stage' && swipe.stage) {
      this.coastStage(swipe.stage, swipe.velocity);
      return;
    }
    const advance =
      vertical >= horizontal * 0.5 && (vertical >= 32 || (vertical >= 18 && average >= 0.45));
    const direction = advance ? Math.sign(distance) : 0;
    this.scrollToIndex(swipe.index + direction, undefined, speed);
  }

  private cancelSwipe(): void {
    const swipe = this.swipe;
    this.swipe = null;
    const content = this.content().nativeElement;
    content.classList.remove('is-paging');
    // iOS can take over for a code pan. Settle the feed on a card.
    if (swipe?.mode === 'stage') return;
    if (swipe?.dragging || this.nearestSlide(content).offset > 1)
      this.scrollToIndex(swipe?.index ?? this.nearestSlide(content).index);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (this.tab() !== 'feed' || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target instanceof Element ? event.target : null;
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
      const choices = [
        ...(slide?.querySelectorAll<HTMLButtonElement>(
          '.quiz-option:not(:disabled), button.code-line:not(:disabled)',
        ) ?? []),
      ].filter((button) => !button.closest('[inert]'));
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

  private scrollToIndex(index: number, behavior?: ScrollBehavior, speed = 0): void {
    const content = this.content().nativeElement;
    const slides = content.querySelectorAll<HTMLElement>('.feed-slide');
    const target = Math.max(0, Math.min(index, slides.length - 1));
    const slide = slides[target];
    if (!slide) return;
    const reduce = this.document.defaultView?.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    const top =
      slide.getBoundingClientRect().top - content.getBoundingClientRect().top + content.scrollTop;
    if (target !== this.feed.activeIndex()) {
      this.setDiscussionQuestion(null);
      this.feed.setActive(target);
    }
    if (behavior === 'auto' || reduce) {
      this.stopSettle();
      content.classList.remove('is-paging');
      content.scrollTop = top;
      return;
    }
    this.settleTo(content, top, speed);
  }

  private settleTo(content: HTMLElement, top: number, speed: number): void {
    this.stopSettle();
    const from = content.scrollTop;
    const distance = top - from;
    if (Math.abs(distance) < 1) {
      content.scrollTop = top;
      content.classList.remove('is-paging');
      return;
    }
    // Match the release speed to the start of the easing curve.
    const duration = Math.min(360, Math.max(160, (3 * Math.abs(distance)) / Math.max(speed, 0.6)));
    const start = performance.now();
    content.classList.add('is-paging');
    const step = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - start) / duration));
      content.scrollTop = from + distance * (1 - (1 - progress) ** 3);
      if (progress < 1) {
        this.settleFrame = requestAnimationFrame(step);
        return;
      }
      this.settleFrame = 0;
      content.classList.remove('is-paging');
      this.syncActive(content);
    };
    this.settleFrame = requestAnimationFrame(step);
  }

  private stopSettle(): boolean {
    if (!this.settleFrame) return false;
    cancelAnimationFrame(this.settleFrame);
    this.settleFrame = 0;
    return true;
  }

  private coastStage(stage: HTMLElement, velocity: number): void {
    cancelAnimationFrame(this.stageFrame);
    if (Math.abs(velocity) < 0.2) return;
    let speed = velocity;
    let last = performance.now();
    const step = (now: number) => {
      const elapsed = Math.min(32, now - last);
      last = now;
      const before = stage.scrollTop;
      stage.scrollTop = before + speed * elapsed;
      speed *= 0.95 ** (elapsed / 16);
      const stuck = Math.abs(stage.scrollTop - before) < 0.5 && elapsed > 0;
      this.stageFrame = Math.abs(speed) > 0.02 && !stuck ? requestAnimationFrame(step) : 0;
    };
    this.stageFrame = requestAnimationFrame(step);
  }

  private keepPosition(removed: number, apply: () => void): void {
    const content = this.content().nativeElement;
    this.swipe = null;
    this.stopSettle();
    content.classList.remove('is-paging');
    const anchor = content.querySelectorAll<HTMLElement>('.feed-slide')[removed];
    const removedHeight = anchor
      ? anchor.getBoundingClientRect().top - content.getBoundingClientRect().top + content.scrollTop
      : 0;
    const oldScroll = content.scrollTop;
    apply();
    afterNextRender(
      () => {
        if (this.compactFeed()) this.scrollToIndex(this.feed.activeIndex(), 'auto');
        else content.scrollTop = Math.max(0, oldScroll - removedHeight);
      },
      {
        injector: this.injector,
      },
    );
  }

  protected setDiscussion(questionId: string, open: boolean): void {
    if (open) this.setDiscussionQuestion(questionId);
    else if (this.discussionQuestion() === questionId) this.setDiscussionQuestion(null);
  }

  private setDiscussionQuestion(value: string | null): void {
    const toggles = (value === null) !== (this.discussionQuestion() === null);
    const content = this.content().nativeElement;
    const view = this.document.defaultView;
    const animate =
      toggles &&
      this.tab() === 'feed' &&
      !!view?.matchMedia('(min-width: 1200px)').matches &&
      !view.matchMedia('(prefers-reduced-motion: reduce)').matches &&
      typeof content.animate === 'function';
    const before = animate ? content.getBoundingClientRect().left + this.cardLeft(content) : 0;
    this.discussionQuestion.set(value);
    if (!animate) return;
    afterNextRender(
      () => {
        const delta = before - (content.getBoundingClientRect().left + this.cardLeft(content));
        if (Math.abs(delta) < 1) return;
        content.animate([{ transform: `translateX(${delta}px)` }, { transform: 'translateX(0)' }], {
          duration: 320,
          easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
        });
      },
      { injector: this.injector },
    );
  }

  private cardLeft(content: HTMLElement): number {
    const slide = content.querySelector<HTMLElement>(
      `.feed-slide[data-feed-index="${this.feed.activeIndex()}"]`,
    );
    return slide ? slide.getBoundingClientRect().left - content.getBoundingClientRect().left : 0;
  }

  protected editInterests(): void {
    this.feed.restart();
  }
}
