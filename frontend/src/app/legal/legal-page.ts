import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Brand } from '../brand/brand';
import { contactHref, PublicConfig } from '../config/public-config';
import { DisplaySettings } from '../learning/display-settings';
import { LEGAL_DOCUMENTS, type LegalKind, type LegalSection } from './legal-content';

interface Block {
  list: boolean;
  lines: string[];
}

/** Groups consecutive "• " lines into one list so the markup stays a real <ul>. */
export function legalBlocks(section: LegalSection): Block[] {
  const blocks: Block[] = [];
  for (const line of section.body) {
    const item = line.startsWith('• ');
    const last = blocks[blocks.length - 1];
    if (item && last?.list) last.lines.push(line.slice(2));
    else blocks.push({ list: item, lines: [item ? line.slice(2) : line] });
  }
  return blocks;
}

@Component({
  selector: 'app-legal-page',
  imports: [Brand, RouterLink],
  template: `
    <div class="shell">
      <header class="header">
        <a class="brand" routerLink="/" aria-label="WhyLint"><app-brand /></a>
        <div class="language" role="group" [attr.aria-label]="ui().languageLabel">
          <button
            type="button"
            [attr.aria-pressed]="language() === 'ja'"
            (click)="settings.setLanguage('ja')"
          >
            日本語
          </button>
          <button
            type="button"
            [attr.aria-pressed]="language() === 'en'"
            (click)="settings.setLanguage('en')"
          >
            English
          </button>
        </div>
      </header>
      <main class="content">
        <a routerLink="/" class="back"><span aria-hidden="true">←</span>{{ ui().back }}</a>
        <h1>{{ doc().title }}</h1>
        <p class="updated">{{ doc().updated }}</p>
        <p class="intro">{{ doc().intro }}</p>
        @for (section of doc().sections; track section.heading) {
          <section>
            <h2>{{ section.heading }}</h2>
            @for (block of blocks(section); track $index) {
              @if (block.list) {
                <ul>
                  @for (line of block.lines; track $index) {
                    <li>{{ line }}</li>
                  }
                </ul>
              } @else {
                @for (line of block.lines; track $index) {
                  <p>{{ line }}</p>
                }
              }
            }
          </section>
        }
        <section class="contact">
          <h2>{{ ui().contact }}</h2>
          @if (config.supportContact(); as contact) {
            @if (href(contact); as link) {
              <p>
                <a [href]="link" rel="noopener noreferrer">{{ contact }}</a>
              </p>
            } @else {
              <p>{{ contact }}</p>
            }
          } @else {
            <p>{{ ui().noContact }}</p>
          }
        </section>
        <nav class="other" [attr.aria-label]="ui().otherLabel">
          <a [routerLink]="otherPath()">{{ ui().other }}</a>
        </nav>
      </main>
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-height: 100dvh;
      background: var(--canvas);
      color: var(--text);
    }
    .shell {
      max-width: 760px;
      margin: 0 auto;
      padding: env(safe-area-inset-top, 0px) 20px calc(40px + env(safe-area-inset-bottom, 0px));
    }
    .header {
      min-height: 56px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      border-bottom: 1px solid var(--border);
    }
    .brand {
      min-height: 48px;
      display: flex;
      align-items: center;
      color: var(--text);
      text-decoration: none;
    }
    .language {
      display: inline-flex;
      gap: 4px;
    }
    .language button {
      min-height: 44px;
      padding: 0 12px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--control);
      color: var(--text);
      font-size: 0.8125rem;
    }
    .language button[aria-pressed='true'] {
      border-color: var(--accent);
      color: var(--accent);
      background: var(--control-selected);
    }
    .content {
      padding: 16px 0 24px;
    }
    .back {
      display: inline-flex;
      gap: 8px;
      align-items: center;
      min-height: 48px;
      color: var(--muted);
      text-decoration: none;
      font-size: 0.875rem;
    }
    h1 {
      margin: 8px 0 4px;
      font-size: clamp(1.75rem, 6vw, 2.25rem);
      line-height: 1.2;
      letter-spacing: -0.03em;
    }
    .updated {
      margin: 0 0 16px;
      color: var(--muted);
      font-size: 0.875rem;
    }
    .intro {
      line-height: 1.75;
    }
    h2 {
      margin: 32px 0 8px;
      font-size: 1.125rem;
    }
    p,
    li {
      line-height: 1.75;
      color: var(--text);
      overflow-wrap: anywhere;
    }
    p {
      margin: 0 0 12px;
    }
    ul {
      margin: 0 0 12px;
      padding-left: 1.25rem;
    }
    a {
      color: var(--accent);
      text-underline-offset: 3px;
    }
    .other {
      margin-top: 40px;
      padding-top: 16px;
      border-top: 1px solid var(--border);
    }
    .other a {
      display: inline-flex;
      align-items: center;
      min-height: 48px;
    }
  `,
})
export class LegalPage {
  protected readonly settings = inject(DisplaySettings);
  protected readonly config = inject(PublicConfig);
  private readonly route = inject(ActivatedRoute);
  private readonly kind = (this.route.snapshot.data['kind'] as LegalKind) ?? 'terms';
  protected readonly language = this.settings.language;
  protected readonly doc = computed(() => LEGAL_DOCUMENTS[this.kind][this.language()]);
  protected readonly blocks = legalBlocks;
  protected readonly otherPath = () => (this.kind === 'terms' ? '/privacy' : '/terms');
  protected readonly ui = computed(() =>
    this.language() === 'ja'
      ? {
          back: '戻る',
          languageLabel: '言語',
          contact: 'お問い合わせ先',
          noContact: 'サポートの連絡先はまだ公開されていません。',
          other: this.kind === 'terms' ? 'プライバシーポリシーを読む' : '利用規約を読む',
          otherLabel: '関連文書',
        }
      : {
          back: 'Back',
          languageLabel: 'Language',
          contact: 'Contact',
          noContact: 'A support contact has not been published yet.',
          other: this.kind === 'terms' ? 'Read the Privacy Policy' : 'Read the Terms of Service',
          otherLabel: 'Related document',
        },
  );

  constructor() {
    void this.config.load();
  }

  protected href(contact: string): string | null {
    return contactHref(contact);
  }
}
