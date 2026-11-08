import {
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthSession } from '../auth/auth-session';
import { LearningApi, learningError } from './learning-api';
import { LEARNING_CATALOG } from './learning-catalog';
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
  /** Optional tap quiz so community questions play like the rest of the feed. */
  protected readonly options = signal<string[]>(['', '', '', '']);
  protected readonly correctOption = signal<number | null>(null);
  protected readonly letters = ['A', 'B', 'C', 'D'];
  protected readonly publishing = signal(false);
  protected readonly error = signal('');
  protected readonly codeError = signal('');
  protected readonly published = signal<Question | null>(null);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.controller.abort());
    effect(() => {
      if (this.session.status() === 'loading' || this.session.status() === 'unavailable') return;
      const owner = this.session.user()?.id ?? null;
      untracked(() => {
        if (owner === this.owner) return;
        this.owner = owner;
        this.controller.abort();
        this.controller = new AbortController();
        this.clear();
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
      if (!signal.aborted) this.published.set(result.question);
    } catch (error) {
      if (!signal.aborted) this.error.set(learningError(error, this.language()));
    } finally {
      if (!signal.aborted) this.publishing.set(false);
    }
  }
}
