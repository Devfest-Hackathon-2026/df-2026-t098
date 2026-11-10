import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DisplaySettings } from '../learning/display-settings';
import { contactHref, PublicConfig } from './public-config';

/**
 * Privacy policy, terms and the support contact. The documents live in this app (/privacy,
 * /terms) unless LEGAL_BASE_URL points somewhere else; the support contact is shown only when
 * it is configured.
 */
@Component({
  selector: 'app-legal-links',
  imports: [RouterLink],
  template: `
    @if (config.privacyUrl(); as privacy) {
      <nav class="legal-links" [attr.aria-label]="text('法的情報', 'Legal')">
        <a [href]="privacy" target="_blank" rel="noopener noreferrer">{{
          text('プライバシーポリシー', 'Privacy policy')
        }}</a>
        <a [href]="config.termsUrl()" target="_blank" rel="noopener noreferrer">{{
          text('利用規約', 'Terms of service')
        }}</a>
      </nav>
    } @else {
      <nav class="legal-links" [attr.aria-label]="text('法的情報', 'Legal')">
        <a routerLink="/privacy">{{ text('プライバシーポリシー', 'Privacy policy') }}</a>
        <a routerLink="/terms">{{ text('利用規約', 'Terms of service') }}</a>
      </nav>
    }
    @if (support() && config.supportContact(); as contact) {
      <p class="support-contact">
        {{ text('サポート: ', 'Support: ') }}
        @if (href(contact); as link) {
          <a [href]="link" rel="noopener noreferrer">{{ contact }}</a>
        } @else {
          <span>{{ contact }}</span>
        }
      </p>
    }
  `,
  styles: `
    :host {
      display: block;
      margin-top: 16px;
    }
    .legal-links {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 20px;
    }
    a {
      display: inline-flex;
      align-items: center;
      min-height: 44px;
      color: var(--muted);
      font-size: 0.8125rem;
      text-decoration: underline;
      text-underline-offset: 3px;
    }
    a:hover {
      color: var(--text);
    }
    .support-contact {
      margin: 4px 0 0;
      color: var(--muted);
      font-size: 0.8125rem;
    }
    .support-contact a {
      min-height: 0;
    }
  `,
})
export class LegalLinks {
  readonly support = input(false);
  protected readonly config = inject(PublicConfig);
  private readonly settings = inject(DisplaySettings);

  constructor() {
    void this.config.load();
  }

  protected text(ja: string, en: string): string {
    return this.settings.language() === 'ja' ? ja : en;
  }

  protected href(contact: string): string | null {
    return contactHref(contact);
  }
}
