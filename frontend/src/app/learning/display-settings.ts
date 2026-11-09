import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import type { Language } from './learning.types';

export type ReadingSize = 'standard' | 'large' | 'larger';

const READING_SCALE: Record<ReadingSize, number> = {
  standard: 1,
  large: 1.15,
  larger: 1.3,
};

@Injectable({ providedIn: 'root' })
export class DisplaySettings {
  private readonly document = inject(DOCUMENT);
  private readonly systemTheme = this.document.defaultView?.matchMedia?.(
    '(prefers-color-scheme: light)',
  );
  private hasThemePreference = ['light', 'dark'].includes(this.read('whylint-theme') ?? '');
  readonly language = signal<Language>(this.read('whylint-language') === 'en' ? 'en' : 'ja');
  readonly theme = signal<'light' | 'dark'>(
    this.read('whylint-theme') === 'light' ? 'light' : 'dark',
  );
  readonly readingSize = signal<ReadingSize>('standard');

  constructor() {
    const readingSize = this.read('whylint-reading-size');
    if (readingSize === 'large' || readingSize === 'larger') this.readingSize.set(readingSize);
    if (!this.hasThemePreference && this.systemTheme?.matches) this.theme.set('light');
    const onSystemThemeChange = (event: MediaQueryListEvent) => {
      if (this.hasThemePreference) return;
      this.theme.set(event.matches ? 'light' : 'dark');
      this.switchTheme();
    };
    this.systemTheme?.addEventListener?.('change', onSystemThemeChange);
    inject(DestroyRef).onDestroy(() =>
      this.systemTheme?.removeEventListener?.('change', onSystemThemeChange),
    );
    this.apply();
  }

  setLanguage(language: Language): void {
    this.language.set(language);
    this.save('whylint-language', language);
    this.apply();
  }
  toggleTheme(): void {
    this.setTheme(this.theme() === 'light' ? 'dark' : 'light');
  }
  setTheme(theme: 'light' | 'dark'): void {
    this.hasThemePreference = true;
    this.theme.set(theme);
    this.save('whylint-theme', this.theme());
    this.switchTheme();
  }
  setReadingSize(size: ReadingSize): void {
    this.readingSize.set(size);
    this.save('whylint-reading-size', size);
    this.apply();
  }
  private read(key: string): string | null {
    try {
      return this.document.defaultView?.localStorage.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  private save(key: string, value: string): void {
    try {
      this.document.defaultView?.localStorage.setItem(key, value);
    } catch {
    }
  }
  private switchTheme(): void {
    const root = this.document.documentElement;
    const view = this.document.defaultView;
    root.classList.add('theme-switching');
    this.apply();
    if (!view?.requestAnimationFrame) {
      root.classList.remove('theme-switching');
      return;
    }
    view.requestAnimationFrame(() =>
      view.requestAnimationFrame(() => root.classList.remove('theme-switching')),
    );
  }
  private apply(): void {
    this.document.documentElement.style.setProperty(
      '--reading-scale',
      String(READING_SCALE[this.readingSize()]),
    );
    this.document.documentElement.dataset['readingSize'] = this.readingSize();
    this.document.documentElement.dataset['theme'] = this.theme();
    this.document.documentElement.lang = this.language();
    this.document.title =
      this.language() === 'ja'
        ? 'WhyLint — 技術の「なぜ」を学ぼう'
        : 'WhyLint — Understand why technology works';
    this.document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', this.theme() === 'light' ? '#f3f5f0' : '#080808');
  }
}
