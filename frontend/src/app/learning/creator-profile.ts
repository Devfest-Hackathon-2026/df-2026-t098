import { Component, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DisplaySettings } from './display-settings';
import { Icon } from './icon';
import { LearningApi, LearningError, learningError } from './learning-api';
import { LoadingSkeleton } from './loading-skeleton';
import type { CreatorProfile } from './learning.types';

@Component({
  selector: 'app-creator-profile',
  imports: [RouterLink, Icon, LoadingSkeleton],
  templateUrl: './creator-profile.html',
  styleUrl: './creator-profile.css',
})
export class CreatorProfilePage {
  protected readonly settings = inject(DisplaySettings);
  private readonly api = inject(LearningApi);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, { requireSync: true });
  private controller = new AbortController();
  protected readonly profile = signal<CreatorProfile | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly failedAvatar = signal(false);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.controller.abort());
    effect(() => {
      const id = this.params().get('id');
      untracked(() => {
        this.controller.abort();
        this.controller = new AbortController();
        this.profile.set(null);
        this.failedAvatar.set(false);
        this.loading.set(false);
        void this.load(id);
      });
    });
  }

  protected text(ja: string, en: string): string {
    return this.settings.language() === 'ja' ? ja : en;
  }

  protected async load(id = this.params().get('id')): Promise<void> {
    if (this.loading()) return;
    this.error.set('');
    if (!id) {
      this.error.set(
        this.text('プロフィールが見つかりません。', 'This profile could not be found.'),
      );
      return;
    }
    const signal = this.controller.signal;
    this.loading.set(true);
    try {
      const profile = await this.api.get<CreatorProfile>(
        '/creators/' + encodeURIComponent(id),
        signal,
      );
      if (!signal.aborted) this.profile.set(profile);
    } catch (error) {
      if (!signal.aborted) {
        this.error.set(
          error instanceof LearningError && [400, 404].includes(error.status)
            ? this.text('プロフィールが見つかりません。', 'This profile could not be found.')
            : learningError(error, this.settings.language()),
        );
      }
    } finally {
      if (!signal.aborted) this.loading.set(false);
    }
  }
}
