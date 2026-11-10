import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  Injector,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { LegalLinks } from '../config/legal-links';
import { BlockStore } from './block-store';
import { PublishDraftStore } from './publish-draft';
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
  imports: [
    RouterLink,
    UsernameSetup,
    Icon,
    LanguagePicker,
    LoadingSkeleton,
    MasteryRadar,
    LegalLinks,
  ],
  templateUrl: './profile-panel.html',
  styleUrls: ['./learning-panels.css', './profile-panel.css'],
})
export class ProfilePanel {
  readonly language = input<Language>('ja');
  readonly view = input<'profile' | 'settings'>('profile');
  readonly navigate = output<'profile' | 'settings'>();
  protected readonly session = inject(AuthSession);
  private readonly api = inject(LearningApi);
  protected readonly settings = inject(DisplaySettings);
  private readonly onboarding = inject(OnboardingState);
  private readonly progressStore = inject(ProgressStore);
  protected readonly blocks = inject(BlockStore);
  private readonly drafts = inject(PublishDraftStore);
  private readonly languagePicker = viewChild(LanguagePicker);
  private readonly injector = inject(Injector);
  private readonly accountCard = viewChild<ElementRef<HTMLButtonElement>>('accountCard');
  private readonly accountSettingsHeading =
    viewChild<ElementRef<HTMLHeadingElement>>('accountSettingsHeading');
  private readonly accountSettingsOwner = signal<string | null>(null);
  protected readonly accountSettingsOpen = computed(
    () => this.accountSettingsOwner() === this.session.user()?.id,
  );
  private controller = new AbortController();
  private owner: string | null | undefined;
  protected readonly progress = this.progressStore.progress;
  protected readonly saved = signal<Question[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly savedLoading = signal(false);
  protected readonly savedError = signal('');
  protected readonly failedAvatarUrl = signal<string | null>(null);
  protected readonly signOutFailed = signal(false);
  protected readonly confirmingDelete = signal(false);
  protected readonly deleting = signal(false);
  protected readonly deleteError = signal('');
  protected readonly accountDeleted = signal(false);
  protected readonly blockError = signal('');
  protected readonly unblocking = signal<string | null>(null);
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
        this.accountSettingsOwner.set(null);
        this.confirmingDelete.set(false);
        this.signOutFailed.set(false);
        this.deleteError.set('');
        this.controller.abort();
        this.controller = new AbortController();
        this.saved.set([]);
        this.error.set('');
        this.savedError.set('');
        this.savedLoading.set(false);
        this.loading.set(false);
        this.savingLanguage.set(false);
        this.languageError.set('');
        this.blocks.blocked.set([]);
        this.blockError.set('');
        if (userId) {
          void this.load();
          void this.loadBlocks();
        }
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
    const transfer = this.progressStore.syncGuestAnswers();
    if (transfer) await transfer;
    if (signal.aborted) return;
    const [progress] = await Promise.allSettled([
      this.api.get<Progress>('/progress', signal),
      this.loadSaved(),
    ]);
    if (signal.aborted) return;
    if (progress.status === 'fulfilled') {
      this.progress.set(progress.value);
    } else this.error.set(learningError(progress.reason, this.language()));
    this.loading.set(false);
  }

  protected async loadSaved(): Promise<void> {
    if (this.savedLoading() || !this.session.user()) return;
    const signal = this.controller.signal;
    this.savedLoading.set(true);
    this.savedError.set('');
    try {
      const result = await this.api.get<{ questions: Question[] }>('/saved', signal);
      if (!signal.aborted) this.saved.set(result.questions);
    } catch (error) {
      if (!signal.aborted) this.savedError.set(learningError(error, this.language()));
    } finally {
      if (!signal.aborted) this.savedLoading.set(false);
    }
  }

  protected async signOut(): Promise<void> {
    this.signOutFailed.set(false);
    if (!(await this.session.logout())) this.signOutFailed.set(true);
  }

  protected openAccountSettings(): void {
    const account = this.session.user();
    if (!account || this.session.status() !== 'authenticated') return;
    this.accountSettingsOwner.set(account.id);
    afterNextRender(() => this.accountSettingsHeading()?.nativeElement.focus(), {
      injector: this.injector,
    });
  }

  protected closeAccountSettings(): void {
    this.accountSettingsOwner.set(null);
    this.confirmingDelete.set(false);
    this.deleteError.set('');
    afterNextRender(() => this.accountCard()?.nativeElement.focus(), { injector: this.injector });
  }

  protected async loadBlocks(): Promise<void> {
    try {
      await this.blocks.load();
    } catch {
      this.blockError.set(
        this.text('ブロック一覧を読み込めませんでした。', 'Could not load your blocked learners.'),
      );
    }
  }

  protected async unblock(userId: string): Promise<void> {
    if (this.unblocking()) return;
    this.unblocking.set(userId);
    this.blockError.set('');
    try {
      await this.blocks.unblock(userId);
    } catch (error) {
      this.blockError.set(learningError(error, this.language()));
    } finally {
      this.unblocking.set(null);
    }
  }

  protected askDelete(): void {
    this.deleteError.set('');
    this.accountDeleted.set(false);
    this.confirmingDelete.set(true);
  }

  protected cancelDelete(): void {
    if (!this.deleting()) this.confirmingDelete.set(false);
  }

  protected async deleteAccount(): Promise<void> {
    if (this.deleting() || this.session.status() !== 'authenticated') return;
    this.deleting.set(true);
    this.deleteError.set('');
    const result = await this.session.deleteAccount();
    this.deleting.set(false);
    if (result === 'deleted') {
      this.confirmingDelete.set(false);
      this.accountDeleted.set(true);
      this.onboarding.clear();
      this.drafts.clear();
      return;
    }
    this.deleteError.set(
      {
        unauthorized: this.text(
          'ログインの有効期限が切れました。もう一度ログインしてから削除してください。',
          'Your session has expired. Sign in again to delete your account.',
        ),
        rateLimit: this.text(
          '試行回数が多すぎます。少し待ってからもう一度お試しください。',
          'Too many attempts. Wait a little and try again.',
        ),
        failed: this.text(
          'アカウントを削除できませんでした。接続を確認して、もう一度お試しください。',
          'Could not delete your account. Check your connection and try again.',
        ),
      }[result],
    );
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
