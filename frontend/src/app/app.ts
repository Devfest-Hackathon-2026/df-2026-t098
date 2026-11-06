import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthSession } from './auth/auth-session';

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('frontend');
  protected readonly session = inject(AuthSession);
  private readonly document = inject(DOCUMENT);
  protected readonly sessionLanguage = this.readSessionLanguage();

  constructor() {
    const destroyRef = inject(DestroyRef);
    void this.session.refresh();

    const onVisibilityChange = () => {
      if (this.document.visibilityState === 'visible') void this.session.refresh();
    };
    this.document.addEventListener('visibilitychange', onVisibilityChange);
    destroyRef.onDestroy(() => this.document.removeEventListener('visibilitychange', onVisibilityChange));
  }

  private readSessionLanguage(): 'ja' | 'en' {
    try {
      return this.document.defaultView?.localStorage.getItem('whylint-language') === 'en' ? 'en' : 'ja';
    } catch {
      return 'ja';
    }
  }
}
