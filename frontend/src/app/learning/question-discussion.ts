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
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthSession } from '../auth/auth-session';
import { BlockStore } from './block-store';
import { Icon } from './icon';
import { LearningApi, learningError } from './learning-api';
import { LoadingSkeleton } from './loading-skeleton';
import type { ContributionKind, Language, QuestionComment } from './learning.types';

@Component({
  selector: 'app-question-discussion',
  imports: [FormsModule, RouterLink, Icon, LoadingSkeleton, NgTemplateOutlet],
  templateUrl: './question-discussion.html',
  styleUrl: './question-discussion.css',
  host: { '(document:keydown.escape)': 'onEscape($event)' },
})
export class QuestionDiscussion {
  readonly questionId = input.required<string>();
  readonly viewId = input<string>();
  readonly refreshKey = input(0);
  readonly language = input<Language>('ja');
  readonly open = input(false);
  readonly answered = input(true);
  protected readonly revealedSpoilers = signal<ReadonlySet<string>>(new Set());
  readonly closed = output<void>();
  protected readonly session = inject(AuthSession);
  private readonly api = inject(LearningApi);
  private readonly blockStore = inject(BlockStore);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly panel = viewChild<ElementRef<HTMLDialogElement>>('panel');
  private readonly heading = viewChild<ElementRef<HTMLHeadingElement>>('heading');
  private readonly body = viewChild<ElementRef<HTMLDivElement>>('body');
  private readonly composer = viewChild<ElementRef<HTMLTextAreaElement>>('composer');
  private controller = new AbortController();
  private identity = '';
  private modal = false;
  private refreshPending = false;
  private lastRefreshKey = 0;
  private requestId = '';
  private submittedPayload = '';
  protected readonly desktop = signal(false);
  private drag: {
    id: number;
    startY: number;
    dy: number;
    samples: { y: number; t: number }[];
  } | null = null;
  protected readonly comments = signal<QuestionComment[]>([]);
  protected readonly comment = signal('');
  protected readonly commenting = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly deleting = signal<string | null>(null);
  protected readonly helping = signal<string | null>(null);
  protected readonly kind = signal<ContributionKind>('comment');
  protected readonly kinds: ContributionKind[] = [
    'comment',
    'explanation',
    'question',
    'correction',
  ];
  protected readonly replyingTo = signal<QuestionComment | null>(null);
  protected readonly reportingId = signal<string | null>(null);
  protected readonly reportReason = signal<'spam' | 'harassment' | 'inappropriate' | 'other'>(
    'spam',
  );
  protected readonly reportDetails = signal('');
  protected readonly reporting = signal(false);
  protected readonly blockingId = signal<string | null>(null);
  protected readonly blocking = signal(false);
  protected readonly notice = signal('');
  protected readonly controlId = computed(() => this.viewId() || this.questionId());
  protected readonly roots = computed(() => this.comments().filter((comment) => !comment.parentId));

  constructor() {
    const destroy = inject(DestroyRef);
    const media = this.document.defaultView?.matchMedia?.('(min-width: 1200px)');
    this.desktop.set(media?.matches ?? false);
    const resize = () => this.desktop.set(media?.matches ?? false);
    media?.addEventListener('change', resize);
    destroy.onDestroy(() => {
      this.controller.abort();
      media?.removeEventListener('change', resize);
      const panel = this.panel()?.nativeElement;
      if (panel?.open) panel.close();
    });

    effect(() => {
      const questionId = this.questionId();
      const status = this.session.status();
      const identity = (this.session.user()?.id ?? 'guest') + ':' + questionId;
      const open = this.open();
      const refreshKey = this.refreshKey();
      if (status === 'loading' || status === 'unavailable') return;
      untracked(() => {
        if (identity !== this.identity) {
          this.identity = identity;
          this.controller.abort();
          this.controller = new AbortController();
          this.comments.set([]);
          this.comment.set('');
          this.commenting.set(false);
          this.loading.set(false);
          this.error.set('');
          this.deleting.set(null);
          this.helping.set(null);
          this.kind.set('comment');
          this.replyingTo.set(null);
          this.reportingId.set(null);
          this.blockingId.set(null);
          this.notice.set('');
          this.refreshPending = false;
          this.requestId = '';
          this.submittedPayload = '';
        }
        const refreshChanged = refreshKey !== this.lastRefreshKey;
        this.lastRefreshKey = refreshKey;
        if (open) void this.loadComments(refreshChanged);
      });
    });

    effect(() => {
      const panel = this.panel()?.nativeElement;
      const open = this.open();
      const desktop = this.desktop();
      if (!panel) return;
      afterNextRender(
        () => {
          if (open !== this.open() || desktop !== this.desktop()) return;
          if (!open) {
            if (panel.open) panel.close();
            return;
          }
          const modal = !desktop;
          if (panel.open && this.modal !== modal) panel.close();
          if (!panel.open) {
            if (desktop) panel.show();
            else panel.showModal();
            this.modal = modal;
            this.heading()?.nativeElement.focus({ preventScroll: true });
          }
        },
        { injector: this.injector },
      );
    });
  }

  // Hide explanations and corrections until the learner has answered.
  protected isSpoiler(comment: { id: string; kind?: string | null }): boolean {
    return (
      !this.answered() &&
      (comment.kind === 'explanation' || comment.kind === 'correction') &&
      !this.revealedSpoilers().has(comment.id)
    );
  }

  protected revealSpoiler(id: string): void {
    this.revealedSpoilers.update((ids) => new Set([...ids, id]));
  }

  protected text(ja: string, en: string): string {
    return this.language() === 'ja' ? ja : en;
  }

  protected get authenticated(): boolean {
    return this.session.status() === 'authenticated';
  }

  protected get mutating(): boolean {
    return (
      this.commenting() ||
      this.deleting() !== null ||
      this.helping() !== null ||
      this.reporting() ||
      this.blocking()
    );
  }

  protected kindLabel(kind: ContributionKind = 'comment'): string {
    return {
      comment: this.text('コメント', 'Comment'),
      explanation: this.text('説明', 'Explanation'),
      question: this.text('質問', 'Question'),
      correction: this.text('訂正', 'Correction'),
    }[kind];
  }

  protected replies(parentId: string): QuestionComment[] {
    return this.comments().filter((comment) => comment.parentId === parentId);
  }

  protected reply(comment: QuestionComment): void {
    this.replyingTo.set(comment);
    afterNextRender(() => this.composer()?.nativeElement.focus({ preventScroll: true }), {
      injector: this.injector,
    });
  }

  protected close(event?: Event): void {
    event?.preventDefault();
    this.panel()?.nativeElement.close();
  }

  protected onNativeClose(): void {
    if (this.open() && !this.panel()?.nativeElement.open) this.closed.emit();
  }

  protected onEscape(event: Event): void {
    if (this.open()) this.close(event);
  }

  protected keepFocus(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || this.desktop()) return;
    const panel = this.panel()?.nativeElement;
    if (!panel) return;
    const controls = panel.querySelectorAll<HTMLElement>(
      'button:not(:disabled), textarea:not(:disabled), a[href]',
    );
    const first = controls.item(0);
    const last = controls.item(controls.length - 1);
    const active = this.document.activeElement;
    if (event.shiftKey && (active === first || active === this.heading()?.nativeElement)) {
      event.preventDefault();
      last?.focus({ preventScroll: true });
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first?.focus({ preventScroll: true });
    }
  }

  protected onDragStart(event: PointerEvent): void {
    const panel = this.panel()?.nativeElement;
    if (this.desktop() || !panel || (event.target as HTMLElement).closest('button')) return;
    this.drag = {
      id: event.pointerId,
      startY: event.clientY,
      dy: 0,
      samples: [{ y: event.clientY, t: event.timeStamp }],
    };
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
    }
    panel.style.transition = 'none';
  }

  protected onDragMove(event: PointerEvent): void {
    const panel = this.panel()?.nativeElement;
    if (!this.drag || !panel || event.pointerId !== this.drag.id) return;
    const dy = event.clientY - this.drag.startY;
    this.drag.dy = dy >= 0 ? dy : -Math.sqrt(-dy) * 2;
    this.drag.samples = [...this.drag.samples.slice(-4), { y: event.clientY, t: event.timeStamp }];
    panel.style.transform = `translateY(${this.drag.dy}px)`;
  }

  protected onDragEnd(event: PointerEvent, cancelled = false): void {
    const panel = this.panel()?.nativeElement;
    if (!this.drag || !panel || event.pointerId !== this.drag.id) return;
    const { dy, samples } = this.drag;
    this.drag = null;
    const recent = samples.filter((sample) => event.timeStamp - sample.t <= 100);
    const first = recent[0];
    const velocity =
      first && recent.length > 1
        ? (event.clientY - first.y) / Math.max(1, event.timeStamp - first.t)
        : 0;
    panel.style.transition = '';
    panel.style.transform = '';
    const flicked = velocity > 0.5 && dy > 30;
    if (!cancelled && dy > 0 && (flicked || dy > panel.offsetHeight * 0.25)) this.close();
  }

  protected onBackdrop(event: MouseEvent): void {
    const panel = this.panel()?.nativeElement;
    if (this.desktop() || !panel || event.target !== panel) return;
    const bounds = panel.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      this.close();
  }

  protected async loadComments(force = false): Promise<void> {
    if (this.loading() || this.mutating) {
      if (force) this.refreshPending = true;
      return;
    }
    this.refreshPending = false;
    const signal = this.controller.signal;
    this.loading.set(true);
    this.error.set('');
    try {
      const result = await this.api.get<{ comments: QuestionComment[] }>(
        '/questions/' + this.questionId() + '/comments',
        signal,
      );
      if (!signal.aborted) this.comments.set(result.comments);
    } catch (error) {
      if (!signal.aborted) this.error.set(learningError(error, this.language()));
    } finally {
      if (!signal.aborted) {
        this.loading.set(false);
        this.refreshIfNeeded();
      }
    }
  }

  protected async postComment(): Promise<void> {
    const text = this.comment().trim();
    if (!this.authenticated || !text || this.mutating || this.loading()) return;
    const signal = this.controller.signal;
    const payload = {
      text,
      kind: this.replyingTo() ? 'comment' : this.kind(),
      parentId: this.replyingTo()?.id ?? null,
    };
    const serialized = JSON.stringify(payload);
    if (!this.requestId || this.submittedPayload !== serialized) {
      this.requestId = crypto.randomUUID();
      this.submittedPayload = serialized;
    }
    this.commenting.set(true);
    this.error.set('');
    try {
      const comment = await this.api.send<QuestionComment>(
        '/questions/' + this.questionId() + '/comments',
        'POST',
        { ...payload, requestId: this.requestId },
        signal,
      );
      if (!signal.aborted) {
        this.comments.update((items) => [
          ...items.filter((item) => item.id !== comment.id),
          comment,
        ]);
        this.comment.set('');
        this.replyingTo.set(null);
        this.requestId = '';
        this.submittedPayload = '';
        afterNextRender(
          () => {
            const body = this.body()?.nativeElement;
            if (body && this.open() && !signal.aborted) body.scrollTop = body.scrollHeight;
          },
          { injector: this.injector },
        );
      }
    } catch (error) {
      if (!signal.aborted) this.error.set(learningError(error, this.language()));
    } finally {
      if (!signal.aborted) {
        this.commenting.set(false);
        this.refreshIfNeeded();
      }
    }
  }

  protected async deleteComment(comment: QuestionComment): Promise<void> {
    if (this.mutating || this.loading() || comment.author.id !== this.session.user()?.id) return;
    const signal = this.controller.signal;
    this.deleting.set(comment.id);
    this.error.set('');
    try {
      await this.api.send(
        '/questions/' + this.questionId() + '/comments/' + comment.id,
        'DELETE',
        {},
        signal,
      );
      if (!signal.aborted) {
        this.comments.update((items) => {
          if (items.some((item) => item.parentId === comment.id && !item.deleted)) {
            return items.map((item) =>
              item.id === comment.id
                ? { ...item, text: '', deleted: true, helpful: false, helpfulCount: 0 }
                : item,
            );
          }
          const remaining = items.filter((item) => item.id !== comment.id);
          return remaining.filter(
            (item) => !item.deleted || remaining.some((reply) => reply.parentId === item.id),
          );
        });
        if (this.replyingTo()?.id === comment.id) this.replyingTo.set(null);
      }
    } catch (error) {
      if (!signal.aborted) this.error.set(learningError(error, this.language()));
    } finally {
      if (!signal.aborted) {
        this.deleting.set(null);
        this.refreshIfNeeded();
      }
    }
  }

  protected async toggleHelpful(comment: QuestionComment): Promise<void> {
    if (
      !this.authenticated ||
      this.mutating ||
      comment.deleted ||
      comment.author.id === this.session.user()?.id
    )
      return;
    const signal = this.controller.signal;
    this.helping.set(comment.id);
    this.error.set('');
    try {
      const result = await this.api.send<{ helpful: boolean; helpfulCount: number }>(
        '/questions/' + this.questionId() + '/comments/' + comment.id + '/helpful',
        'PUT',
        { helpful: !comment.helpful },
        signal,
      );
      if (!signal.aborted)
        this.comments.update((items) =>
          items.map((item) => (item.id === comment.id ? { ...item, ...result } : item)),
        );
    } catch (error) {
      if (!signal.aborted) this.error.set(learningError(error, this.language()));
    } finally {
      if (!signal.aborted) {
        this.helping.set(null);
        this.refreshIfNeeded();
      }
    }
  }

  protected openReport(comment: QuestionComment): void {
    this.blockingId.set(null);
    this.notice.set('');
    this.reportReason.set('spam');
    this.reportDetails.set('');
    this.reportingId.set(this.reportingId() === comment.id ? null : comment.id);
  }

  protected async submitReport(comment: QuestionComment): Promise<void> {
    if (!this.authenticated || this.mutating || this.loading()) return;
    const signal = this.controller.signal;
    this.reporting.set(true);
    this.error.set('');
    try {
      await this.api.send(
        '/questions/' + this.questionId() + '/comments/' + comment.id + '/reports',
        'POST',
        { reason: this.reportReason(), details: this.reportDetails().trim() },
        signal,
      );
      if (signal.aborted) return;
      // The server hides a reported comment (and its replies) from the reporter.
      this.comments.update((items) =>
        items.filter((item) => item.id !== comment.id && item.parentId !== comment.id),
      );
      if (this.replyingTo()?.id === comment.id) this.replyingTo.set(null);
      this.reportingId.set(null);
      this.notice.set(
        this.text(
          '報告を受け付けました。このコメントは非表示になりました。',
          'Report received. This comment is now hidden for you.',
        ),
      );
    } catch (error) {
      if (!signal.aborted) this.error.set(learningError(error, this.language()));
    } finally {
      if (!signal.aborted) {
        this.reporting.set(false);
        this.refreshIfNeeded();
      }
    }
  }

  protected askBlock(comment: QuestionComment): void {
    this.reportingId.set(null);
    this.notice.set('');
    this.blockingId.set(this.blockingId() === comment.id ? null : comment.id);
  }

  protected async confirmBlock(comment: QuestionComment): Promise<void> {
    if (!this.authenticated || this.mutating || this.loading()) return;
    const signal = this.controller.signal;
    this.blocking.set(true);
    this.error.set('');
    try {
      await this.blockStore.block(comment.author);
      if (signal.aborted) return;
      this.comments.update((items) => {
        const hidden = new Set(
          items.filter((item) => item.author.id === comment.author.id).map((item) => item.id),
        );
        return items.filter((item) => !hidden.has(item.id) && !hidden.has(item.parentId ?? ''));
      });
      this.blockingId.set(null);
      this.notice.set(
        this.text(
          comment.author.displayName + 'さんをブロックしました。',
          'You blocked ' + comment.author.displayName + '.',
        ),
      );
    } catch (error) {
      if (!signal.aborted) this.error.set(learningError(error, this.language()));
    } finally {
      if (!signal.aborted) {
        this.blocking.set(false);
        this.refreshIfNeeded();
      }
    }
  }

  private refreshIfNeeded(): void {
    if (this.refreshPending && this.open()) void this.loadComments();
  }
}
