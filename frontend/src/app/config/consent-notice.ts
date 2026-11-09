import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DisplaySettings } from '../learning/display-settings';
import { PublicConfig } from './public-config';

/**
 * "By continuing you agree to the Terms and Privacy Policy" with working links: the owner's
 * published documents when LEGAL_BASE_URL is set, otherwise the pages in this app.
 */
@Component({
  selector: 'app-consent-notice',
  imports: [RouterLink],
  template: `
    <p class="consent">
      {{ copy().pre }}
      @if (config.termsUrl(); as terms) {
        <a [href]="terms" target="_blank" rel="noopener noreferrer">{{ copy().terms }}</a
        >{{ copy().mid
        }}<a [href]="config.privacyUrl()" target="_blank" rel="noopener noreferrer">{{
          copy().privacy
        }}</a>
      } @else {
        <a routerLink="/terms">{{ copy().terms }}</a
        >{{ copy().mid }}<a routerLink="/privacy">{{ copy().privacy }}</a>
      }
      {{ copy().post }}
    </p>
  `,
  styles: `
    .consent {
      margin: 16px 0 0;
      color: var(--muted);
      font-size: 0.8125rem;
      line-height: 1.7;
    }
    a {
      color: var(--text);
      text-underline-offset: 3px;
    }
  `,
})
export class ConsentNotice {
  readonly action = input<'signup' | 'continue'>('continue');
  protected readonly config = inject(PublicConfig);
  private readonly settings = inject(DisplaySettings);
  protected readonly copy = computed(() => {
    const signup = this.action() === 'signup';
    return this.settings.language() === 'ja'
      ? {
          pre: '',
          terms: '利用規約',
          mid: 'と',
          privacy: 'プライバシーポリシー',
          post: signup ? 'に同意のうえ、アカウントを作成します。' : 'に同意のうえ、続けます。',
        }
      : {
          pre: signup
            ? 'By creating an account, you agree to the '
            : 'By continuing, you agree to the ',
          terms: 'Terms of Service',
          mid: ' and ',
          privacy: 'Privacy Policy',
          post: '.',
        };
  });

  constructor() {
    void this.config.load();
  }
}
