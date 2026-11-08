import {
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthSession } from '../auth/auth-session';
import { UsernameSetup } from '../auth/username-setup';
import { LearningApi, LearningError, learningError } from './learning-api';
import { Icon } from './icon';
import { LanguagePicker } from './language-picker';
import { LoadingSkeleton } from './loading-skeleton';
import { DisplaySettings, type ReadingSize } from './display-settings';
import { OnboardingState } from '../onboarding/onboarding-state';
import { MasteryRadar } from './mastery-radar';
import { badgeInfo } from './learning-hud';
import { ProgressStore } from './progress-store';
import { topicLabel } from './topic-label';
import type { Language, Preferences, Progress, Question } from './learning.types';

@Component({
  selector: 'app-profile-panel',
  imports: [RouterLink, UsernameSetup, Icon, LanguagePicker, LoadingSkeleton, MasteryRadar],
  templateUrl: './profile-panel.html',
  styleUrls: ['./learning-panels.css', './profile-panel.css'],
})
export class ProfilePanel {
  readonly language = input<Language>('ja');
  protected readonly session = inject(AuthSession);
  private readonly api = inject(LearningApi);
  protected readonly settings = inject(DisplaySettings);
  private readonly onboarding = inject(OnboardingState);
  private readonly progressStore = inject(ProgressStore);
  private readonly languagePicker = viewChild(LanguagePicker);
  private controller = new AbortController();
  private owner: string | null | undefined;
  protected readonly progress = signal<Progress | null>(null);
  protected readonly saved = signal<Question[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly failedAvatarUrl = signal<string | null>(null);
  protected readonly signOutFailed = signal(false);
  protected readonly selectedLanguage = signal<Language>(this.settings.language());
  protected readonly savingLanguage = signal(false);
  protected readonly languageError = signal('');
  protected readonly readingSizes: { value: ReadingSize; ja: string; en: string }[] = [
    { value: 'standard', ja: '標準', en: 'Standard' },
    { value: 'large', ja: '大きい', en: 'Large' },
    { value: 'larger', ja: 'さらに大きい', en: 'Larger' },
  ];

  constructor() {
    inject(DestroyRef).onDestroy(() => this.controller.abort());
    effect(() => {
      const language = this.settings.language();
      if (!this.savingLanguage()) this.selectedLanguage.set(language);
    });
    effect(() => {
      if (this.session.status() === 'loading' || this.session.status() === 'unavailable') return;
      const userId = this.session.user()?.id ?? null;
      untracked(() => {
        if (this.owner === userId) return;
        this.owner = userId;
        this.controller.abort();
        this.controller = new AbortController();
        this.progress.set(null);
        this.saved.set([]);
        this.error.set('');
        this.loading.set(false);
        this.savingLanguage.set(false);
        this.languageError.set('');
        if (userId) void this.load();
      });
    });
  }

  protected text(ja: string, en: string): string {
    return this.language() === 'ja' ? ja : en;
  }
  protected badgeName(id: string): string {
    return badgeInfo(id, this.language()).name;
  }
  protected badgeIcon(id: string): string {
    return badgeInfo(id, this.language()).icon;
  }
  protected topic(topic: string): string {
    return topicLabel(topic, this.language());
  }
  protected earnedCount(stats: Progress): number {
    return stats.achievements.filter((badge) => badge.earned).length;
  }

  protected async load(): Promise<void> {
    if (this.loading() || !this.session.user()) return;
    const signal = this.controller.signal;
    this.loading.set(true);
    this.error.set('');
    const results = await Promise.allSettled([
      this.api.get<Progress>('/progress', signal),
      this.api.get<{ questions: Question[] }>('/saved', signal),
    ]);
    if (signal.aborted) return;
    const [progress, saved] = results;
    if (progress.status === 'fulfilled') {
      this.progress.set(progress.value);
      this.progressStore.progress.set(progress.value);
    } else this.error.set(learningError(progress.reason, this.language()));
    if (saved.status === 'fulfilled') this.saved.set(saved.value.questions);
    else this.error.set(learningError(saved.reason, this.language()));
    this.loading.set(false);
  }

  protected async signOut(): Promise<void> {
    this.signOutFailed.set(false);
    if (!(await this.session.logout())) this.signOutFailed.set(true);
  }

  protected async changeLanguage(language: Language): Promise<void> {
    const owner = this.session.user()?.id;
    if (!owner || this.session.status() !== 'authenticated' || this.savingLanguage()) return;
    if (language === this.settings.language()) return;
    const signal = this.controller.signal;
    this.savingLanguage.set(true);
    this.selectedLanguage.set(language);
    this.languageError.set('');
    try {
      const result = await this.api.send<{ preferences: Preferences }>(
        '/preferences/language',
        'PATCH',
        { language },
        signal,
      );
      if (signal.aborted || this.session.user()?.id !== owner) return;
      this.onboarding.save(result.preferences, owner);
      this.settings.setLanguage(language);
    } catch (error) {
      if (!signal.aborted) {
        this.selectedLanguage.set(this.settings.language());
        this.languagePicker()?.restoreSelection(this.settings.language());
        this.languageError.set(
          error instanceof LearningError && (error.status === 401 || error.status === 429)
            ? learningError(error, this.language())
            : this.text(
                '言語を保存できませんでした。もう一度お試しください。',
                'Could not save your language. Please try again.',
              ),
        );
        if (error instanceof LearningError && error.status === 401) void this.session.refresh();
      }
    } finally {
      if (!signal.aborted) this.savingLanguage.set(false);
    }
  }
}
