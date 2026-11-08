import { Component, DestroyRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { OnboardingState } from './onboarding-state';
import { UsernameSetup } from '../auth/username-setup';
import { AuthSession } from '../auth/auth-session';
import { DisplaySettings } from '../learning/display-settings';
import { LearningApi, learningError } from '../learning/learning-api';
import { LEARNING_CATALOG } from '../learning/learning-catalog';
import { LanguagePicker } from '../learning/language-picker';
import type { Catalog, Difficulty, Preferences } from '../learning/learning.types';

@Component({
  selector: 'app-onboarding',
  imports: [FormsModule, UsernameSetup, LanguagePicker],
  templateUrl: './onboarding.html',
  styleUrl: './onboarding.css',
})
export class Onboarding {
  protected readonly settings = inject(DisplaySettings);
  protected readonly session = inject(AuthSession);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly state = inject(OnboardingState);
  private readonly api = inject(LearningApi);
  private readonly usernameSetup = viewChild(UsernameSetup);
  private readonly controller = new AbortController();
  protected readonly editing = this.route.snapshot.queryParamMap.get('edit') === '1';
  private readonly initialLanguage = this.settings.language();
  protected readonly catalog = signal<Catalog>(LEARNING_CATALOG);
  protected readonly step = signal(1);
  protected readonly interests = signal<string[]>([]);
  protected readonly technologies = signal<string[]>([]);
  protected readonly difficulty = signal<Difficulty>('beginner');
  protected readonly query = signal('');
  protected readonly starting = signal(false);
  protected readonly error = signal('');
  protected readonly levels: Difficulty[] = ['beginner', 'intermediate', 'advanced'];
  protected get language() {
    return this.settings.language();
  }
  protected get options() {
    return this.catalog().technologies.filter((value) =>
      value.toLowerCase().includes(this.query().trim().toLowerCase()),
    );
  }
  protected get canAdd() {
    const query = this.query().trim();
    return (
      !!query &&
      query.length <= 60 &&
      !this.technologies().some((value) => value.toLowerCase() === query.toLowerCase()) &&
      !this.catalog().technologies.some((value) => value.toLowerCase() === query.toLowerCase())
    );
  }

  constructor() {
    inject(DestroyRef).onDestroy(() => this.controller.abort());
    const saved = this.state.read();
    if (saved) {
      this.interests.set(saved.interests);
      this.technologies.set(saved.technologies);
      this.difficulty.set(saved.difficulty);
    }
    void this.api
      .get<Catalog>('/catalog', this.controller.signal)
      .then((catalog) => {
        if (
          !this.controller.signal.aborted &&
          Array.isArray(catalog.interests) &&
          Array.isArray(catalog.technologies)
        )
          this.catalog.set(catalog);
      })
      .catch(() => {
        /* The bundled selectable catalog remains available offline. */
      });
  }

  protected text(ja: string, en: string): string {
    return this.language === 'ja' ? ja : en;
  }
  protected levelLabel(level: Difficulty): string {
    return {
      beginner: this.text('初級', 'Beginner'),
      intermediate: this.text('中級', 'Intermediate'),
      advanced: this.text('上級', 'Advanced'),
    }[level];
  }
  protected toggleInterest(id: string): void {
    this.interests.update((items) =>
      items.includes(id) ? items.filter((item) => item !== id) : [...items, id],
    );
  }
  protected toggleTechnology(value: string): void {
    if (this.technologies().includes(value))
      this.technologies.update((items) => items.filter((item) => item !== value));
    else if (this.technologies().length < 40)
      this.technologies.update((items) => [...items, value]);
  }
  protected addTechnology(): void {
    if (this.canAdd) {
      this.toggleTechnology(this.query().trim());
      this.query.set('');
    }
  }
  protected cancel(): void {
    this.settings.setLanguage(this.initialLanguage);
    // Replace the entry: Back from the feed should leave the app, not reopen setup.
    void this.router.navigateByUrl('/', { replaceUrl: true });
  }

  /** Skip setup and start tapping right away with every area at beginner level. */
  protected quickStart(): void {
    if (!this.interests().length)
      this.interests.set(this.catalog().interests.map((interest) => interest.id));
    void this.complete();
  }

  protected async complete(): Promise<void> {
    if (!this.interests().length || this.starting()) return;
    this.starting.set(true);
    this.error.set('');
    const ownerId = this.session.user()?.id ?? null;
    try {
      const username = this.usernameSetup();
      if (username && !(await username.saveIfEntered())) return;
      if ((this.session.user()?.id ?? null) !== ownerId) return;
      const preferences: Preferences = {
        interests: this.interests(),
        technologies: this.technologies(),
        difficulty: this.difficulty(),
        language: this.settings.language(),
      };
      if (ownerId) await this.api.send('/preferences', 'PUT', preferences, this.controller.signal);
      if (this.controller.signal.aborted || (this.session.user()?.id ?? null) !== ownerId) return;
      if (!this.state.save(preferences, ownerId)) {
        this.error.set(
          this.text(
            '設定を保存できませんでした。端末の保存設定を確認してください。',
            'Could not save preferences. Check this device’s storage settings.',
          ),
        );
        return;
      }
      // Replace the setup entry so Back from the feed does not return to it.
      await this.router.navigateByUrl('/', { replaceUrl: true });
    } catch (error) {
      if (!this.controller.signal.aborted) this.error.set(learningError(error, this.language));
    } finally {
      this.starting.set(false);
    }
  }
}
