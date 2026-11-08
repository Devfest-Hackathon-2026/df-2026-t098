import { DOCUMENT } from '@angular/common';
import { inject, Injectable, signal } from '@angular/core';
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
  readonly language = signal<Language>(this.read('whylint-language') === 'en' ? 'en' : 'ja');
  readonly theme = signal<'light' | 'dark'>(
    this.read('whylint-theme') === 'light' ? 'light' : 'dark',
  );
  readonly readingSize = signal<ReadingSize>('standard');

  constructor() {
    const readingSize = this.read('whylint-reading-size');
    if (readingSize === 'large' || readingSize === 'larger') this.readingSize.set(readingSize);
    if (
      !this.read('whylint-theme') &&
      this.document.defaultView?.matchMedia?.('(prefers-color-scheme: light)').matches
    )
      this.theme.set('light');
    this.apply();
  }

  setLanguage(language: Language): void {
    this.language.set(language);
    this.save('whylint-language', language);
    this.apply();
  }
  toggleTheme(): void {
    this.theme.set(this.theme() === 'light' ? 'dark' : 'light');
    this.save('whylint-theme', this.theme());
    this.apply();
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
      /* Keep the active session usable. */
    }
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
