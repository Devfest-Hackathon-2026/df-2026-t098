import { DOCUMENT } from '@angular/common';
import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import type { Language } from './learning.types';

export type ReadingSize = 'standard' | 'large' | 'larger';

const READING_SCALE: Record<ReadingSize, number> = {
  standard: 1,
  large: 1.15,
  larger: 1.3,
};
const LOCATION_LANGUAGE_KEY = 'whylint-language-detected';

@Injectable({ providedIn: 'root' })
export class DisplaySettings {
  private readonly document = inject(DOCUMENT);
  private readonly systemTheme = this.document.defaultView?.matchMedia?.(
    '(prefers-color-scheme: light)',
  );
  private hasThemePreference = ['light', 'dark'].includes(this.read('whylint-theme') ?? '');
  private readonly chosenLanguage = signal(this.readLanguage('whylint-language'));
  private readonly locationLanguage = signal(this.readLanguage(LOCATION_LANGUAGE_KEY));
  private locationLookup?: Promise<void>;
  readonly usesLocationLanguage = computed(() => !this.chosenLanguage() && !!this.locationLanguage());
  readonly language = signal<Language>(this.initialLanguage());
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
    this.chosenLanguage.set(language);
    this.language.set(language);
    this.save('whylint-language', language);
    this.apply();
  }
  resolveDefaultLanguage(request: typeof fetch): Promise<void> | undefined {
    if (this.chosenLanguage() || this.locationLanguage()) return;
    this.locationLookup ??= this.fetchLocationLanguage(request);
    return this.locationLookup;
  }

  private async fetchLocationLanguage(request: typeof fetch): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
    try {
      const response = await request('/api/v1/config/locale', {
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        signal: controller.signal,
      });
      if (!response.ok) return;
      const { defaultLanguage }: { defaultLanguage?: unknown } = await response.json();
      if (controller.signal.aborted || this.chosenLanguage()) return;
      if (defaultLanguage !== 'ja' && defaultLanguage !== 'en') return;
      this.locationLanguage.set(defaultLanguage);
      this.save(LOCATION_LANGUAGE_KEY, defaultLanguage);
      this.language.set(defaultLanguage);
      this.apply();
    } catch {
      // The browser language is already available.
    } finally {
      clearTimeout(timeout);
    }
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
  private initialLanguage(): Language {
    const saved = this.chosenLanguage() ?? this.locationLanguage();
    if (saved) return saved;
    const browser = this.document.defaultView?.navigator?.language ?? 'ja';
    return browser.toLowerCase().startsWith('ja') ? 'ja' : 'en';
  }
  private readLanguage(key: string): Language | null {
    const value = this.read(key);
    return value === 'en' || value === 'ja' ? value : null;
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
      ?.setAttribute('content', this.theme() === 'light' ? '#e9eee1' : '#080808');
  }
}
