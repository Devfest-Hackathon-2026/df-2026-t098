import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { AuthSession } from '../auth/auth-session';
import { LearningApi } from '../learning/learning-api';
import { LEARNING_CATALOG } from '../learning/learning-catalog';
import { DisplaySettings } from '../learning/display-settings';
import type { Preferences } from '../learning/learning.types';

export interface LearningPreference extends Preferences {
  onboardingCompleted: true;
}

@Injectable({ providedIn: 'root' })
export class OnboardingState {
  private readonly document = inject(DOCUMENT);
  private readonly session = inject(AuthSession);
  private readonly api = inject(LearningApi);
  private readonly settings = inject(DisplaySettings);
  private readonly key = 'whylint-onboarding-v2';

  read(): LearningPreference | null {
    try {
      const storage = this.document.defaultView?.localStorage;
      const raw = storage?.getItem(this.key);
      if (raw) {
        const value = JSON.parse(raw);
        return this.isValid(value) ? value : null;
      }
      const legacy = JSON.parse(storage?.getItem('whylint-onboarding-v1') ?? 'null');
      if (
        legacy?.onboardingCompleted === true &&
        legacy.domain === 'frontend' &&
        legacy.stack === 'javascript'
      ) {
        return {
          interests: ['frontend'],
          technologies: ['JavaScript'],
          difficulty: 'beginner',
          onboardingCompleted: true,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  save(
    preferences: Preferences,
    ownerId: string | null = this.session.user()?.id ?? null,
  ): boolean {
    const value = {
      ...preferences,
      language: preferences.language ?? this.settings.language(),
      onboardingCompleted: true as const,
    };
    if (!this.isValid(value)) return false;
    try {
      const storage = this.document.defaultView?.localStorage;
      if (!storage) return false;
      storage.setItem(this.key, JSON.stringify({ ...value, ownerId }));
      return true;
    } catch {
      return false;
    }
  }

  async restore(): Promise<LearningPreference | null> {
    if (this.session.status() === 'loading') await this.session.refresh();
    const userId = this.session.user()?.id;
    const local = this.read();
    if (!userId) return local;
    try {
      const result = await this.api.get<{ preferences: Preferences | null }>('/preferences');
      if (this.session.user()?.id !== userId) return null;
      if (result.preferences) {
        if (result.preferences.language === 'ja' || result.preferences.language === 'en') {
          this.settings.setLanguage(result.preferences.language);
        }
        this.save(result.preferences, userId);
        return { ...result.preferences, onboardingCompleted: true };
      }
      if (local && !this.owner()) {
        await this.api.send('/preferences', 'PUT', this.preferences(local));
        if (this.session.user()?.id !== userId) return null;
        this.save(local, userId);
        return local;
      }
      return null;
    } catch {
      return this.owner() === userId ? local : null;
    }
  }

  preferences(value: Preferences): Preferences {
    return {
      interests: [...value.interests],
      technologies: [...value.technologies],
      difficulty: value.difficulty,
      language: value.language ?? this.settings.language(),
    };
  }

  private owner(): string | null {
    try {
      return (
        JSON.parse(this.document.defaultView?.localStorage.getItem(this.key) ?? 'null')?.ownerId ??
        null
      );
    } catch {
      return null;
    }
  }

  private isValid(value: unknown): value is LearningPreference {
    if (!value || typeof value !== 'object') return false;
    const record = value as LearningPreference;
    return (
      record.onboardingCompleted === true &&
      (record.language === undefined || record.language === 'ja' || record.language === 'en') &&
      ['beginner', 'intermediate', 'advanced'].includes(record.difficulty) &&
      Array.isArray(record.interests) &&
      record.interests.length > 0 &&
      record.interests.length <= 6 &&
      record.interests.every((item) =>
        LEARNING_CATALOG.interests.some((interest) => interest.id === item),
      ) &&
      Array.isArray(record.technologies) &&
      record.technologies.length <= 40 &&
      record.technologies.every(
        (item) => typeof item === 'string' && item.trim().length > 0 && item.length <= 60,
      )
    );
  }
}
