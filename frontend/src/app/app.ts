import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthSession } from './auth/auth-session';
import { DisplaySettings } from './learning/display-settings';
import { LoadingSkeleton } from './learning/loading-skeleton';

@Component({
  imports: [RouterOutlet, LoadingSkeleton],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('frontend');
  protected readonly session = inject(AuthSession);
  private readonly document = inject(DOCUMENT);
  protected readonly settings = inject(DisplaySettings);

  constructor() {
    const destroyRef = inject(DestroyRef);
    void this.session.refresh();

    const onVisibilityChange = () => {
      if (this.document.visibilityState === 'visible') void this.session.refresh();
    };
    this.document.addEventListener('visibilitychange', onVisibilityChange);
    destroyRef.onDestroy(() =>
      this.document.removeEventListener('visibilitychange', onVisibilityChange),
    );
  }
}
