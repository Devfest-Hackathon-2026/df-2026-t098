import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Brand } from './brand/brand';
import { DisplaySettings } from './learning/display-settings';

@Component({
  selector: 'app-not-found',
  imports: [Brand, RouterLink],
  template: `
    <section aria-labelledby="missing-page-title">
      <app-brand />
      <h1 id="missing-page-title">{{ text('ページが見つかりません', 'Page not found') }}</h1>
      <p>{{ text('リンクを確認するか、フィードに戻ってください。', 'Check the link or go back to the feed.') }}</p>
      <a routerLink="/">{{ text('フィードに戻る', 'Back to the feed') }}</a>
    </section>
  `,
  styles: `
    section {
      max-width: 680px;
      margin: auto;
      padding: calc(24px + env(safe-area-inset-top, 0px)) 20px 32px;
    }
    h1 { margin: 40px 0 8px; font-size: 1.75rem; }
    p { color: var(--muted); line-height: 1.5; }
    a {
      display: inline-flex;
      align-items: center;
      min-height: 48px;
      color: var(--accent);
      text-underline-offset: 4px;
    }
  `,
})
export class NotFound {
  private readonly settings = inject(DisplaySettings);

  protected text(ja: string, en: string): string {
    return this.settings.language() === 'ja' ? ja : en;
  }
}
