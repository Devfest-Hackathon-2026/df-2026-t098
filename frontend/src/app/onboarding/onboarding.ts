import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Domain, OnboardingState, STACKS } from './onboarding-state';

const COPY = {
  ja: { step: 'STEP', title1: '何を学びたいですか？', intro1: 'まずは、学習する分野を選びましょう。', frontend: 'フロントエンド', frontendDesc: 'ユーザーが操作する画面やUIの仕組みを学ぶ。', backend: 'バックエンド', backendDesc: 'APIやサーバー側の処理を学ぶ。', database: 'データベース', databaseDesc: 'データの保存や取得、SQLを学ぶ。', categorySearch: 'カテゴリ・技術を検索', results: '技術の検索結果', cancel: '変更をキャンセル', next: '次へ', title2: 'スタックを選びましょう', intro2: '学習したい言語・技術を1つ選んでください。', search: '言語・技術を検索', placeholder: '名前で検索', clear: 'クリア', empty: '一致する候補がありません。', soon: '準備中', back: '戻る', start: '学習を始める', note: '現在のプレビューはJavaScriptのサンプル問題のみです。', unavailable: 'この分野の問題は準備中です。戻ってフロントエンドを選択できます。', storage: '設定を保存できませんでした。保存設定を確認してもう一度お試しください。', light: 'ライトテーマに切り替え', dark: 'ダークテーマに切り替え' },
  en: { step: 'STEP', title1: 'What would you like to learn?', intro1: 'First, choose an area to explore.', frontend: 'Frontend', frontendDesc: 'Learn how interfaces and the screens people use work.', backend: 'Backend', backendDesc: 'Learn about APIs and server-side logic.', database: 'Database', databaseDesc: 'Learn about storing and querying data with SQL.', categorySearch: 'Search categories and technologies', results: 'Technology results', cancel: 'Cancel changes', next: 'Continue', title2: 'Choose your stack', intro2: 'Choose one language or technology to practice.', search: 'Search languages and technologies', placeholder: 'Search by name', clear: 'Clear', empty: 'No matching options found.', soon: 'Coming soon', back: 'Back', start: 'Start learning', note: 'The current preview contains JavaScript sample questions only.', unavailable: 'Questions for this area are coming soon. Go back to choose frontend.', storage: 'Your selection could not be saved. Check your storage settings and try again.', light: 'Switch to light theme', dark: 'Switch to dark theme' },
} as const;

@Component({ selector: 'app-onboarding', imports: [FormsModule], templateUrl: './onboarding.html', styleUrl: './onboarding.css' })
export class Onboarding {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly state = inject(OnboardingState);
  private readonly destroyRef = inject(DestroyRef);
  private readonly systemTheme = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: light)');
  private hasThemePreference = false;
  protected readonly step = signal<1 | 2>(1);
  protected readonly domain = signal<Domain | null>(null);
  protected readonly stack = signal<string | null>(null);
  protected readonly query = signal('');
  protected readonly categoryQuery = signal('');
  protected readonly editing = this.route.snapshot.queryParamMap.get('edit') === '1' && !!this.state.read();
  protected readonly domains: Domain[] = ['frontend', 'backend', 'database'];
  protected readonly storageError = signal(false);
  protected readonly language = signal<'ja' | 'en'>(this.readSetting('whylint-language') === 'en' ? 'en' : 'ja');
  protected readonly theme = signal<'light' | 'dark'>('dark');
  protected get ui() { return COPY[this.language()]; }
  protected get options() { const domain = this.domain(); return domain ? STACKS[domain].filter(o => o.label.toLowerCase().includes(this.query().trim().toLowerCase())) : []; }
  protected get matchingDomains(): Domain[] {
    const query = this.categoryQuery().trim().toLowerCase();
    const names: Record<Domain, string> = { frontend: 'frontend フロントエンド', backend: 'backend バックエンド', database: 'database db データベース' };
    return this.domains.filter(domain => names[domain].includes(query));
  }
  protected get matchingStacks() {
    const query = this.categoryQuery().trim().toLowerCase();
    return query ? this.domains.flatMap(domain => STACKS[domain].filter(option => option.label.toLowerCase().includes(query)).map(option => ({ ...option, domain }))) : [];
  }

  constructor() {
    const stored = this.readSetting('whylint-theme');
    this.hasThemePreference = stored === 'light' || stored === 'dark';
    this.theme.set(stored === 'light' || stored === 'dark' ? stored : this.systemTheme?.matches ? 'light' : 'dark');
    this.applyTheme(); this.applyLanguage();
    const saved = this.editing ? this.state.read() : null;
    if (saved) { this.domain.set(saved.domain); this.stack.set(saved.stack); }
    const onChange = (event: MediaQueryListEvent) => { if (!this.hasThemePreference) { this.theme.set(event.matches ? 'light' : 'dark'); this.applyTheme(); } };
    this.systemTheme?.addEventListener?.('change', onChange);
    this.destroyRef.onDestroy(() => this.systemTheme?.removeEventListener?.('change', onChange));
  }
  private readSetting(key: string): string | null { try { return this.document.defaultView?.localStorage.getItem(key) ?? null; } catch { return null; } }
  private writeSetting(key: string, value: string): void { try { this.document.defaultView?.localStorage.setItem(key, value); } catch { /* Keep settings for this session. */ } }
  private applyTheme(): void { this.document.documentElement.dataset['theme'] = this.theme(); this.document.querySelector('meta[name="theme-color"]')?.setAttribute('content', this.theme() === 'light' ? '#f3f5f0' : '#080808'); }
  private applyLanguage(): void { this.document.documentElement.lang = this.language(); this.document.title = this.language() === 'ja' ? 'WhyLint — コードの「なぜ」を学ぼう' : 'WhyLint — Understand what you ship'; }
  protected toggleLanguage(): void { this.language.set(this.language() === 'ja' ? 'en' : 'ja'); this.applyLanguage(); this.writeSetting('whylint-language', this.language()); }
  protected toggleTheme(): void { this.theme.set(this.theme() === 'dark' ? 'light' : 'dark'); this.hasThemePreference = true; this.applyTheme(); this.writeSetting('whylint-theme', this.theme()); }
  protected selectDomain(domain: Domain): void { if (this.domain() !== domain) { this.stack.set(null); this.query.set(''); } this.domain.set(domain); }
  protected selectResult(domain: Domain, stack: string): void { this.selectDomain(domain); this.stack.set(stack); this.complete(); }
  protected cancel(): void { void this.router.navigateByUrl('/'); }
  protected complete(): void {
    const domain = this.domain(); const stack = this.stack();
    if (!domain || !stack) return;
    if (!this.state.save(domain, stack)) { this.storageError.set(true); return; }
    void this.router.navigateByUrl('/');
  }
}
