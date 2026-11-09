import {
  Component,
  afterNextRender,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  Injector,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthSession } from '../auth/auth-session';
import { LearningApi, learningError } from './learning-api';
import { LEARNING_CATALOG } from './learning-catalog';
import { PublishDraftStore } from './publish-draft';
import type { Difficulty, Language, NewQuestion, Question } from './learning.types';

@Component({
  selector: 'app-publish-question',
  imports: [FormsModule, RouterLink],
  templateUrl: './publish-question.html',
  styleUrls: ['./learning-panels.css', './publish-question.css'],
})
export class PublishQuestion {
  readonly language = input<Language>('ja');
  protected readonly session = inject(AuthSession);
  private readonly api = inject(LearningApi);
  private readonly drafts = inject(PublishDraftStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private controller = new AbortController();
  private owner: string | null | undefined;
  private requestId = '';
  private submittedPayload = '';
  private readonly codeFields = viewChild<ElementRef<HTMLDetailsElement>>('codeFields');
  protected readonly interests = LEARNING_CATALOG.interests;
  protected readonly title = signal('');
  protected readonly prompt = signal('');
  protected readonly referenceAnswer = signal('');
  protected readonly code = signal('');
  protected readonly codeLanguage = signal('');
  protected readonly topic = signal('general');
  protected readonly difficulty = signal<Difficulty>('beginner');
  protected readonly options = signal<string[]>(['', '', '', '']);
  protected readonly correctOption = signal<number | null>(null);
  protected readonly letters = ['A', 'B', 'C', 'D'];
  protected readonly publishing = signal(false);
  protected readonly error = signal('');
  protected readonly codeError = signal('');
  protected readonly published = signal<Question | null>(null);

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      if (this.owner && this.session.user()?.id === this.owner && !this.published()) {
        this.drafts.save(this.owner, {
          title: this.title(),
          prompt: this.prompt(),
          referenceAnswer: this.referenceAnswer(),
          code: this.code(),
          codeLanguage: this.codeLanguage(),
          topic: this.topic(),
          difficulty: this.difficulty(),
          options: [...this.options()],
          correctOption: this.correctOption(),
          requestId: this.requestId,
          submittedPayload: this.submittedPayload,
        });
      }
      this.controller.abort();
    });
    effect(() => {
      if (this.session.status() === 'loading' || this.session.status() === 'unavailable') return;
      const owner = this.session.user()?.id ?? null;
      untracked(() => {
        if (owner === this.owner) return;
        this.owner = owner;
        const draft = this.drafts.take(owner);
        this.controller.abort();
        this.controller = new AbortController();
        this.clear();
        if (draft) {
          this.title.set(draft.title);
          this.prompt.set(draft.prompt);
          this.referenceAnswer.set(draft.referenceAnswer);
          this.code.set(draft.code);
          this.codeLanguage.set(draft.codeLanguage);
          this.topic.set(draft.topic);
          this.difficulty.set(draft.difficulty);
          this.options.set(draft.options);
          this.correctOption.set(draft.correctOption);
          this.requestId = draft.requestId;
          this.submittedPayload = draft.submittedPayload;
        }
      });
    });
  }

  protected setOption(index: number, value: string): void {
    this.options.update((options) => options.map((option, i) => (i === index ? value : option)));
  }

  protected text(ja: string, en: string): string {
    return this.language() === 'ja' ? ja : en;
  }
  protected clear(): void {
    this.drafts.clear();
    this.title.set('');
    this.prompt.set('');
    this.referenceAnswer.set('');
    this.code.set('');
    this.codeLanguage.set('');
    this.options.set(['', '', '', '']);
    this.correctOption.set(null);
    this.error.set('');
    this.codeError.set('');
    this.published.set(null);
    this.publishing.set(false);
    this.requestId = '';
    this.submittedPayload = '';
  }

  private focusField(id: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('#' + id)?.focus(), {
      injector: this.injector,
    });
  }

  protected async publish(event: Event): Promise<void> {
    event.preventDefault();
    if (this.publishing() || this.session.status() !== 'authenticated') return;
    this.error.set('');
    this.codeError.set('');
    const question: Omit<NewQuestion, 'requestId'> = {
      title: this.title().trim(),
      prompt: this.prompt().trim(),
      referenceAnswer: this.referenceAnswer().trim(),
      topics: [this.topic()],
      difficulty: this.difficulty(),
      language: this.language(),
    };
    if (
      question.title.length < 3 ||
      question.prompt.length < 10 ||
      question.referenceAnswer.length < 10
    ) {
      this.error.set(
        this.text(
          'タイトルは3文字以上、質問とお手本の説明は10文字以上入力してください。',
          'Use at least 3 characters for the title, and 10 each for the question and reference explanation.',
        ),
      );
      this.focusField(
        question.title.length < 3
          ? 'question-title'
          : question.prompt.length < 10
            ? 'question-prompt'
            : 'question-reference',
      );
      return;
    }
    const hasCode = !!this.code().trim();
    const hasLanguage = !!this.codeLanguage().trim();
    if (hasCode !== hasLanguage) {
      this.codeError.set(
        hasCode
          ? this.text(
              'コードの言語を入力してください。例：JavaScript、Python。',
              'Enter the code language, such as JavaScript or Python.',
            )
          : this.text(
              'コードを入力するか、コードの言語を空欄にしてください。',
              'Add the code, or clear the code language field.',
            ),
      );
      const details = this.codeFields()?.nativeElement;
      if (details) details.open = true;
      this.focusField(hasCode ? 'question-code-language' : 'question-code');
      return;
    }
    if (hasCode) {
      question.code = this.code();
      question.codeLanguage = this.codeLanguage().trim();
    }
    const filled = this.options()
      .map((option, index) => ({ option: option.trim(), index }))
      .filter((item) => item.option);
    if (filled.length) {
      const correct = filled.findIndex((item) => item.index === this.correctOption());
      if (filled.length < 2 || correct < 0) {
        this.error.set(
          this.text(
            'クイズにするには、選択肢を2つ以上入力して正解を選んでください。',
            'For a tap quiz, add at least two options and mark the correct one.',
          ),
        );
        this.focusField(filled.length < 2 ? 'option-0' : 'correct-' + filled[0].index);
        return;
      }
      question.format = 'choice';
      question.options = filled.map((item) => item.option);
      question.correctOption = correct;
    }
    const payload = JSON.stringify(question);
    if (!this.requestId || this.submittedPayload !== payload) {
      this.requestId = crypto.randomUUID();
      this.submittedPayload = payload;
    }
    const signal = this.controller.signal;
    this.publishing.set(true);
    this.error.set('');
    try {
      const result = await this.api.send<{ question: Question }>(
        '/questions',
        'POST',
        { ...question, requestId: this.requestId },
        signal,
      );
      if (!signal.aborted) {
        this.drafts.clear();
        this.published.set(result.question);
      }
    } catch (error) {
      if (!signal.aborted) this.error.set(learningError(error, this.language()));
    } finally {
      if (!signal.aborted) this.publishing.set(false);
    }
  }
}
