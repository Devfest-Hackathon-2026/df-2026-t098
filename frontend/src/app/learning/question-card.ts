import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  Injector,
  model,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthSession } from '../auth/auth-session';
import { SyntaxHighlightPipe } from '../homepage/syntax-highlight.pipe';
import { Icon } from './icon';
import { QuestionDiscussion } from './question-discussion';
import { LearningApi, LearningError, learningError } from './learning-api';
import { ProgressStore } from './progress-store';
import { topicLabel } from './topic-label';
import type {
  Assessment,
  FollowUp,
  Language,
  Question,
  QuestionTap,
  TapResult,
} from './learning.types';

const LETTERS = ['A', 'B', 'C', 'D'];

@Component({
  selector: 'app-question-card',
  imports: [
    FormsModule,
    RouterLink,
    SyntaxHighlightPipe,
    Icon,
    QuestionDiscussion,
    NgTemplateOutlet,
  ],
  templateUrl: './question-card.html',
  styleUrls: [
    './question-card.css',
    './question-card-quiz.css',
    './question-card-bug.css',
    './question-card-layout.css',
    './question-card-social.css',
    './question-card-details.css',
  ],
})
export class QuestionCard {
  readonly question = input.required<Question>();
  readonly language = input<Language>('ja');
  readonly explainOnOpen = input(false);
  readonly viewId = input('');
  readonly cachedTap = input<QuestionTap | null>(null);
  protected readonly controlId = computed(() => this.viewId() || this.question().id);
  /** A missed card shown again later in the same session. */
  readonly relearn = input(false);
  /** Today's shared Bug of the Day. */
  readonly daily = input(false);
  /** Shows a "Next" button after the reveal (feed only). */
  readonly nextable = input(false);
  readonly next = output<void>();
  readonly assessed = output<Assessment>();
  readonly tapped = output<TapResult>();
  protected readonly session = inject(AuthSession);
  private readonly api = inject(LearningApi);
  private readonly router = inject(Router);
  private readonly progressStore = inject(ProgressStore);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly detailPanel = viewChild<ElementRef<HTMLDialogElement>>('detailPanel');
  private readonly detailHeading = viewChild<ElementRef<HTMLHeadingElement>>('detailHeading');
  private detailTrigger: HTMLElement | null = null;
  private explainedIntent = false;
  protected readonly compact = signal(false);
  protected readonly detailsOpen = signal(false);
  protected readonly detailMode = signal<'explain' | 'ask' | 'info'>('info');
  private readonly commentsButton = viewChild<ElementRef<HTMLButtonElement>>('commentsButton');
  private readonly explainField = viewChild<ElementRef<HTMLTextAreaElement>>('explainField');
  private controller = new AbortController();
  private identity: string | null | undefined;
  private currentQuestion = '';
  private currentView = '';
  private requestId = '';
  private submittedAnswer = '';
  private followUpRequestId = '';
  private followUpSubmitted = '';
  private explanationRequestId = '';
  private explanationSubmitted = '';
  protected readonly letters = LETTERS;
  protected readonly answer = signal('');
  protected readonly result = signal<Assessment | null>(null);
  protected readonly grading = signal(false);
  protected readonly error = signal('');
  protected readonly socialError = signal('');
  protected readonly liked = signal(false);
  protected readonly likes = signal(0);
  protected readonly saved = signal(false);
  protected readonly liking = signal(false);
  protected readonly saving = signal(false);
  protected readonly shareMessage = signal('');
  protected readonly shareUrl = signal('');
  protected readonly picked = signal<number | null>(null);
  protected readonly tap = signal<QuestionTap | null>(null);
  protected readonly tapXp = signal(0);
  protected readonly tapping = signal(false);
  protected readonly tapError = signal('');
  protected readonly tapSignIn = signal(false);
  protected readonly explainOpen = signal(false);
  protected readonly askOpen = signal(false);
  protected readonly followUpDraft = signal('');
  protected readonly followUps = signal<FollowUp[]>([]);
  protected readonly asking = signal(false);
  protected readonly followUpError = signal('');
  protected readonly sharingOpen = signal(false);
  protected readonly sharedExplanation = signal('');
  protected readonly sharing = signal(false);
  protected readonly sharingError = signal('');
  protected readonly explanationPublished = signal(false);
  protected readonly discussionRefresh = signal(0);
  protected readonly reportReason = signal<'incorrect' | 'unclear' | 'outdated'>('incorrect');
  protected readonly reportDetails = signal('');
  protected readonly reporting = signal(false);
  protected readonly reportSent = signal(false);
  protected readonly reportError = signal('');
  protected readonly heartBurst = signal(0);
  protected readonly heartAt = signal<{ x: number; y: number; tilt: number } | null>(null);
  private lastTap = { time: 0, x: 0, y: 0 };
  private lastPointer = 'mouse';
  readonly discussion = model(false);

  protected readonly tappable = computed(() => {
    const question = this.question();
    return question.format !== 'explain' && !!question.options?.length;
  });
  protected readonly revealed = computed(() => this.tap() !== null);
  /** Spot-the-bug renders the code itself as the answer buttons. */
  protected readonly codeLines = computed(() => {
    const question = this.question();
    if (question.format !== 'spot_bug' || !question.code) return null;
    const options = question.options ?? [];
    return question.code.split('\n').map((text, index) => {
      const option = options.indexOf(String(index + 1));
      return { number: index + 1, text, option };
    });
  });

  constructor() {
    const destroy = inject(DestroyRef);
    const media = this.document.defaultView?.matchMedia?.('(max-width: 959px)');
    this.compact.set(media?.matches ?? false);
    const resize = () => {
      this.compact.set(media?.matches ?? false);
      if (!this.compact()) this.closeDetails(false);
    };
    media?.addEventListener('change', resize);
    destroy.onDestroy(() => {
      this.controller.abort();
      media?.removeEventListener('change', resize);
    });
    effect(() => {
      const panel = this.detailPanel()?.nativeElement;
      const open = this.detailsOpen();
      if (!panel) return;
      afterNextRender(
        () => {
          if (open !== this.detailsOpen()) return;
          if (open && !panel.open) {
            panel.showModal();
            this.detailHeading()?.nativeElement.focus({ preventScroll: true });
          } else if (!open && panel.open) panel.close();
        },
        { injector: this.injector },
      );
    });
    effect(() => {
      const question = this.question();
      const relearn = this.relearn();
      const view = this.controlId();
      const status = this.session.status();
      if (status === 'loading' || status === 'unavailable') return;
      const identity = this.session.user()?.id ?? null;
      untracked(() => {
        if (
          identity === this.identity &&
          question.id === this.currentQuestion &&
          view === this.currentView
        )
          return;
        this.identity = identity;
        this.currentQuestion = question.id;
        this.currentView = view;
        this.explainedIntent = false;
        this.controller.abort();
        this.controller = new AbortController();
        this.answer.set('');
        this.result.set(null);
        this.error.set('');
        this.socialError.set('');
        this.grading.set(false);
        this.liking.set(false);
        this.saving.set(false);
        this.discussion.set(false);
        this.shareUrl.set('');
        this.shareMessage.set('');
        this.requestId = '';
        this.submittedAnswer = '';
        this.followUpRequestId = '';
        this.followUpSubmitted = '';
        this.explanationRequestId = '';
        this.explanationSubmitted = '';
        this.liked.set(identity ? question.liked : false);
        this.likes.set(question.likes);
        this.saved.set(identity ? question.saved : false);
        // Reviews and relearning cards start unanswered; otherwise restore the learner's tap.
        const restore =
          this.cachedTap() ?? (identity && !relearn && !question.review ? question.tap : null);
        this.tap.set(restore);
        this.picked.set(restore?.choice ?? null);
        this.tapXp.set(0);
        this.tapping.set(false);
        this.tapError.set('');
        this.tapSignIn.set(false);
        this.closeDetails(false);
        this.explainOpen.set(false);
        this.askOpen.set(false);
        this.followUpDraft.set('');
        this.followUps.set([]);
        this.asking.set(false);
        this.followUpError.set('');
        this.sharingOpen.set(false);
        this.sharedExplanation.set('');
        this.sharing.set(false);
        this.sharingError.set('');
        this.explanationPublished.set(false);
        this.discussionRefresh.set(0);
        this.reportReason.set('incorrect');
        this.reportDetails.set('');
        this.reporting.set(false);
        this.reportSent.set(false);
        this.reportError.set('');
      });
    });
    effect(() => {
      const requested = this.explainOnOpen();
      const status = this.session.status();
      this.question();
      if (!requested || status !== 'authenticated') return;
      untracked(() => {
        if (this.explainedIntent) return;
        this.explainedIntent = true;
        this.openExplain();
      });
    });
  }

  protected text(ja: string, en: string): string {
    return this.language() === 'ja' ? ja : en;
  }
  protected get authenticated(): boolean {
    return this.session.status() === 'authenticated';
  }
  protected get difficulty(): string {
    return {
      beginner: this.text('初級', 'Beginner'),
      intermediate: this.text('中級', 'Intermediate'),
      advanced: this.text('上級', 'Advanced'),
    }[this.question().difficulty];
  }
  protected get formatLabel(): string {
    return {
      explain: this.text('説明してみよう', 'Explain it'),
      choice: this.text('選んで答える', 'Pick one'),
      true_false: this.text('○か×か', 'True or false'),
      predict_output: this.text('出力を予想', 'Predict the output'),
      spot_bug: this.text('バグを探せ', 'Spot the bug'),
    }[this.question().format];
  }
  protected topic(topic: string): string {
    return topicLabel(topic, this.language());
  }
  protected get topics(): string {
    return this.question()
      .topics.filter((topic) => topic !== 'general')
      .slice(0, 3)
      .map((topic) => this.topic(topic))
      .join(' · ');
  }
  /** "Why this card" chip, e.g. "Because you missed JWT". */
  protected get reasonChip(): { icon: string; label: string } | null {
    if (this.daily()) return { icon: 'bug', label: this.text('今日のバグ', 'Bug of the Day') };
    if (this.relearn())
      return {
        icon: 'review',
        label: this.text('さっき間違えた問題', 'You missed this a moment ago'),
      };
    const review = this.question().review;
    if (review) return { icon: 'review', label: this.missedLabel(review.missedAt) };
    const reason = this.question().reason;
    if (!reason) return null;
    const topic = reason.topic ? this.topic(reason.topic) : '';
    switch (reason.kind) {
      case 'weak':
        return {
          icon: 'target',
          label: this.text(`${topic}を克服しよう`, `Because you missed ${topic}`),
        };
      case 'challenge':
        return { icon: 'bolt', label: this.text(`${topic}の応用に挑戦`, `Level up: ${topic}`) };
      case 'interest':
        return {
          icon: 'sparkle',
          label: this.text(`${topic}に興味があるから`, `Because you like ${topic}`),
        };
      case 'general':
        return {
          icon: 'book',
          label: this.text('みんなが知っておきたい基礎', 'Core concept everyone needs'),
        };
      case 'community':
        return { icon: 'users', label: this.text('コミュニティの問題', 'From the community') };
      default:
        return null;
    }
  }

  private missedLabel(missedAt: string | null): string {
    const days = missedAt ? Math.floor((Date.now() - Date.parse(missedAt)) / 86_400_000) : 0;
    if (days <= 0) return this.text('今日間違えた問題', 'You missed this earlier today');
    return this.text(
      `${days}日前に間違えた問題`,
      `You missed this ${days} day${days > 1 ? 's' : ''} ago`,
    );
  }

  protected optionState(index: number): 'correct' | 'wrong' | 'dim' | 'picked' | null {
    const tap = this.tap();
    if (!tap) return this.picked() === index ? 'picked' : null;
    if (index === tap.correctOption) return 'correct';
    if (index === tap.choice) return 'wrong';
    return 'dim';
  }

  /** Instant tap answer, graded from stored data with no AI wait. */
  protected async choose(choice: number): Promise<void> {
    if (this.tapping() || this.revealed()) return;
    const signal = this.controller.signal;
    this.picked.set(choice);
    this.tapping.set(true);
    this.tapError.set('');
    this.tapSignIn.set(false);
    try {
      const result = await this.api.send<TapResult>(
        '/questions/' + this.question().id + '/taps',
        'POST',
        { choice },
        signal,
      );
      if (signal.aborted) return;
      this.tap.set({
        choice: result.choice,
        correct: result.correct,
        correctOption: result.correctOption,
        quickExplanation: result.quickExplanation,
      });
      this.picked.set(result.choice);
      this.tapXp.set(result.xpAwarded);
      this.vibrate(result.correct);
      this.progressStore.applyTap(result);
      this.tapped.emit(result);
    } catch (error) {
      if (!signal.aborted) {
        this.tapSignIn.set(error instanceof LearningError && error.status === 401);
        this.tapError.set(this.tapFailure(error));
      }
    } finally {
      if (!signal.aborted) this.tapping.set(false);
    }
  }

  protected retryTap(): void {
    const choice = this.picked();
    if (choice !== null) void this.choose(choice);
  }

  private tapFailure(error: unknown): string {
    const status = error instanceof LearningError ? error.status : 0;
    if (status === 401)
      return this.text('回答するにはログインしてください。', 'Sign in to submit your answer.');
    if (status === 429)
      return this.text(
        '送信が集中しています。少し待ってから同じ回答を再送信してください。',
        'Too many submissions. Wait a moment, then retry your answer.',
      );
    if (status === 400 || status === 422)
      return this.text(
        'この回答を送信できませんでした。問題を確認して、もう一度お試しください。',
        'This answer could not be accepted. Check the question and try again.',
      );
    return this.text(
      '回答を送信できませんでした。接続を確認して、同じ回答を再送信してください。',
      'Could not send your answer. Check your connection, then retry the option you selected.',
    );
  }

  protected openDetails(mode: 'explain' | 'ask' | 'info', event?: Event): void {
    this.detailTrigger =
      event?.currentTarget instanceof HTMLElement
        ? event.currentTarget
        : (this.document.activeElement as HTMLElement | null);
    this.detailMode.set(mode);
    if (this.compact()) this.detailsOpen.set(true);
  }

  protected openAsk(event?: Event): void {
    if (!this.authenticated) {
      this.openExplain();
      return;
    }
    this.askOpen.set(true);
    this.openDetails('ask', event);
  }

  protected closeDetails(restoreFocus = true): void {
    const panel = this.detailPanel()?.nativeElement;
    this.detailsOpen.set(false);
    if (panel?.open) panel.close();
    if (restoreFocus && this.detailTrigger?.isConnected)
      this.detailTrigger.focus({ preventScroll: true });
  }

  protected detailsClosed(): void {
    if (this.detailsOpen()) this.closeDetails();
  }

  protected detailsBackdrop(event: MouseEvent): void {
    const panel = this.detailPanel()?.nativeElement;
    if (!panel || event.target !== panel) return;
    const box = panel.getBoundingClientRect();
    if (
      event.clientX < box.left ||
      event.clientX > box.right ||
      event.clientY < box.top ||
      event.clientY > box.bottom
    )
      this.closeDetails();
  }

  protected detailsKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const panel = this.detailPanel()?.nativeElement;
    if (!panel) return;
    const controls = [
      ...panel.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], summary',
      ),
    ].filter((control) => control.getClientRects().length > 0);
    const first = controls[0];
    const last = controls[controls.length - 1];
    const active = this.document.activeElement;
    if (event.shiftKey && (active === first || active === this.detailHeading()?.nativeElement)) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first?.focus({ preventScroll: true });
    }
  }

  protected get detailTitle(): string {
    if (this.detailMode() === 'explain') return this.text('なぜ？を説明する', 'Explain why');
    if (this.detailMode() === 'ask') return this.text('Geminiに質問', 'Ask Gemini');
    return this.text('問題の詳細', 'Question details');
  }

  protected onOptionsKeydown(event: KeyboardEvent): void {
    const index = Number(event.key) - 1;
    const options = this.question().options ?? [];
    if (Number.isInteger(index) && index >= 0 && index < options.length) {
      event.preventDefault();
      void this.choose(index);
    }
  }

  private vibrate(correct: boolean): void {
    try {
      navigator.vibrate?.(correct ? 18 : [30, 40, 30]);
    } catch {
      /* Vibration is optional. */
    }
  }

  protected openExplain(): void {
    if (!this.authenticated) {
      void this.router.navigate(['/login'], {
        queryParams: { returnTo: `/questions/${this.question().id}?explain=1` },
      });
      return;
    }
    this.openDetails('explain');
    this.explainOpen.set(true);
    setTimeout(() => this.explainField()?.nativeElement.focus({ preventScroll: true }));
  }

  protected async grade(): Promise<void> {
    if (!this.authenticated || this.grading()) return;
    const answer = this.answer().trim();
    if (!answer) {
      this.error.set(
        this.text('あなたの考えを入力してください。', 'Write your explanation first.'),
      );
      return;
    }
    if (!this.requestId || this.submittedAnswer !== answer) {
      this.requestId = crypto.randomUUID();
      this.submittedAnswer = answer;
    }
    const signal = this.controller.signal;
    this.grading.set(true);
    this.error.set('');
    try {
      const result = await this.api.send<Assessment>(
        '/questions/' + this.question().id + '/attempts',
        'POST',
        { requestId: this.requestId, answer },
        signal,
      );
      if (signal.aborted) return;
      this.result.set(result);
      this.assessed.emit(result);
      void this.progressStore.refreshAfterAssessment();
    } catch (error) {
      if (!signal.aborted) this.error.set(learningError(error, this.language()));
    } finally {
      if (!signal.aborted) this.grading.set(false);
    }
  }

  protected onAnswerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void this.grade();
    }
  }

  protected retryAnswer(): void {
    this.result.set(null);
    this.requestId = '';
    this.error.set('');
  }

  protected openExplanationShare(): void {
    if (!this.authenticated || !this.result()) return;
    if (!this.sharingOpen()) this.sharedExplanation.set(this.answer());
    this.sharingOpen.set(true);
    this.sharingError.set('');
  }

  protected async publishExplanation(): Promise<void> {
    const text = this.sharedExplanation().trim();
    if (!this.authenticated || !this.result() || !text || this.sharing()) return;
    if (text.length > 5000) return;
    if (!this.explanationRequestId || this.explanationSubmitted !== text) {
      this.explanationRequestId = crypto.randomUUID();
      this.explanationSubmitted = text;
    }
    const signal = this.controller.signal;
    this.sharing.set(true);
    this.sharingError.set('');
    try {
      await this.api.send(
        '/questions/' + this.question().id + '/comments',
        'POST',
        { text, kind: 'explanation', requestId: this.explanationRequestId },
        signal,
      );
      if (signal.aborted) return;
      this.explanationPublished.set(true);
      this.sharingOpen.set(false);
      this.explanationRequestId = '';
      this.discussionRefresh.update((value) => value + 1);
      this.closeDetails(false);
      this.discussion.set(true);
    } catch (error) {
      if (!signal.aborted) this.sharingError.set(learningError(error, this.language()));
    } finally {
      if (!signal.aborted) this.sharing.set(false);
    }
  }

  protected async reportQuestion(): Promise<void> {
    if (!this.authenticated || this.reporting() || this.reportSent()) return;
    const signal = this.controller.signal;
    this.reporting.set(true);
    this.reportError.set('');
    try {
      await this.api.send(
        '/questions/' + this.question().id + '/reports',
        'POST',
        { reason: this.reportReason(), details: this.reportDetails().trim() },
        signal,
      );
      if (!signal.aborted) this.reportSent.set(true);
    } catch (error) {
      if (!signal.aborted) this.reportError.set(learningError(error, this.language()));
    } finally {
      if (!signal.aborted) this.reporting.set(false);
    }
  }

  /** "Still confused? Ask Gemini" — a short follow-up answered from the question context. */
  protected async ask(): Promise<void> {
    if (!this.authenticated || this.asking()) return;
    const question = this.followUpDraft().trim();
    if (!question) return;
    if (!this.followUpRequestId || this.followUpSubmitted !== question) {
      this.followUpRequestId = crypto.randomUUID();
      this.followUpSubmitted = question;
    }
    const signal = this.controller.signal;
    this.asking.set(true);
    this.followUpError.set('');
    try {
      const result = await this.api.send<FollowUp>(
        '/questions/' + this.question().id + '/follow-ups',
        'POST',
        { requestId: this.followUpRequestId, question },
        signal,
      );
      if (signal.aborted) return;
      this.followUps.update((items) => [...items, result]);
      this.followUpDraft.set('');
      this.followUpRequestId = '';
    } catch (error) {
      if (!signal.aborted) this.followUpError.set(learningError(error, this.language()));
    } finally {
      if (!signal.aborted) this.asking.set(false);
    }
  }

  protected suggestFollowUp(text: string): void {
    this.followUpDraft.set(text);
    void this.ask();
  }

  protected get suggestions(): string[] {
    return [
      this.text('もっと簡単に説明して', 'Explain it more simply'),
      this.text('実際の例を見せて', 'Show a real-world example'),
      this.text('他の選択肢はなぜ違う？', 'Why are the other options wrong?'),
    ];
  }

  /** Mouse double-click likes. Touch uses its own double-tap detection below. */
  protected doubleClickLike(event: MouseEvent): void {
    if (this.lastPointer !== 'mouse') return;
    this.likeAt(event);
  }

  /**
   * Touch double-tap: two taps within 300ms and 30px. iOS Safari does not reliably fire
   * dblclick, so detect it from pointer events instead.
   */
  protected onContentPointerUp(event: PointerEvent): void {
    this.lastPointer = event.pointerType;
    if (event.pointerType === 'mouse' || this.isControl(event.target)) return;
    const last = this.lastTap;
    const close = Math.hypot(event.clientX - last.x, event.clientY - last.y) < 30;
    if (event.timeStamp - last.time < 300 && close) {
      this.lastTap = { time: 0, x: 0, y: 0 };
      this.likeAt(event);
    } else this.lastTap = { time: event.timeStamp, x: event.clientX, y: event.clientY };
  }

  private likeAt(event: MouseEvent): void {
    if (this.isControl(event.target)) return;
    this.document.getSelection()?.removeAllRanges();
    const bounds = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect();
    if (bounds)
      this.heartAt.set({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
        tilt: Math.round(Math.random() * 24 - 12),
      });
    this.heartBurst.update((value) => value + 1);
    // Guests see the heart; signing in happens from the Like button, not mid-scroll.
    if (this.authenticated && !this.liked()) void this.toggleLike();
  }

  private isControl(target: EventTarget | null): boolean {
    return !!(target as HTMLElement | null)?.closest(
      'button, a, pre, input, textarea, .code-lines',
    );
  }

  protected async toggleLike(): Promise<void> {
    if (!this.authenticated) {
      void this.router.navigate(['/login']);
      return;
    }
    if (this.liking()) return;
    const signal = this.controller.signal;
    this.liking.set(true);
    this.socialError.set('');
    try {
      const result = await this.api.send<{ liked: boolean; likes: number }>(
        '/questions/' + this.question().id + '/like',
        'PUT',
        { liked: !this.liked() },
        signal,
      );
      if (!signal.aborted) {
        this.liked.set(result.liked);
        this.likes.set(result.likes);
      }
    } catch (error) {
      if (!signal.aborted) this.socialError.set(learningError(error, this.language()));
    } finally {
      if (!signal.aborted) this.liking.set(false);
    }
  }

  protected async toggleSave(): Promise<void> {
    if (!this.authenticated) {
      void this.router.navigate(['/login']);
      return;
    }
    if (this.saving()) return;
    const signal = this.controller.signal;
    this.saving.set(true);
    this.socialError.set('');
    try {
      const result = await this.api.send<{ saved: boolean }>(
        '/questions/' + this.question().id + '/save',
        'PUT',
        { saved: !this.saved() },
        signal,
      );
      if (!signal.aborted) this.saved.set(result.saved);
    } catch (error) {
      if (!signal.aborted) this.socialError.set(learningError(error, this.language()));
    } finally {
      if (!signal.aborted) this.saving.set(false);
    }
  }

  protected async share(): Promise<void> {
    const url = new URL('/questions/' + this.question().id, location.origin).href;
    this.shareMessage.set('');
    const tap = this.tap();
    const result = tap
      ? tap.correct
        ? this.text('（正解）', ' (solved)')
        : this.text('（不正解）', ' (missed)')
      : '';
    const title = this.daily()
      ? this.text('WhyLint 今日のバグ', 'WhyLint Bug of the Day') + result
      : this.question().title;
    try {
      if (navigator.share) await navigator.share({ title, text: title, url });
      else if (navigator.clipboard) {
        await navigator.clipboard.writeText(this.daily() ? `${title}\n${url}` : url);
        this.shareMessage.set(this.text('リンクをコピーしました。', 'Link copied.'));
      } else this.shareUrl.set(url);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) this.shareUrl.set(url);
    }
  }

  protected toggleComments(): void {
    this.discussion.update((value) => !value);
  }

  protected closeComments(): void {
    this.discussion.set(false);
    this.commentsButton()?.nativeElement.focus({ preventScroll: true });
  }
}
