import { TestBed } from '@angular/core/testing';
import { DisplaySettings } from './display-settings';

describe('Reading display settings', () => {
  beforeEach(() => {
    localStorage.removeItem('whylint-reading-size');
    localStorage.removeItem('whylint-language');
    localStorage.removeItem('whylint-theme');
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.removeItem('whylint-reading-size');
    localStorage.removeItem('whylint-language');
    localStorage.removeItem('whylint-theme');
    document.documentElement.style.removeProperty('--reading-scale');
    delete document.documentElement.dataset['readingSize'];
  });

  it('starts at the standard reading scale', () => {
    const settings = TestBed.inject(DisplaySettings);

    expect(settings.readingSize()).toBe('standard');
    expect(document.documentElement.style.getPropertyValue('--reading-scale')).toBe('1');
    expect(document.documentElement.dataset['readingSize']).toBe('standard');
  });

  it('follows system appearance until the user chooses a theme', () => {
    let onChange: (event: MediaQueryListEvent) => void = () => {};
    const removeEventListener = vi.fn();
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: (_event: string, listener: (event: MediaQueryListEvent) => void) => {
          onChange = listener;
        },
        removeEventListener,
      } as unknown as MediaQueryList),
    );
    const settings = TestBed.inject(DisplaySettings);
    onChange({ matches: true } as MediaQueryListEvent);
    expect(settings.theme()).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
    settings.toggleTheme();
    onChange({ matches: true } as MediaQueryListEvent);
    expect(settings.theme()).toBe('dark');
    expect(localStorage.getItem('whylint-theme')).toBe('dark');
    TestBed.resetTestingModule();
    expect(removeEventListener).toHaveBeenCalledWith('change', onChange);
  });

  it('switches theme in one frame, without colour transitions lagging behind', async () => {
    const settings = TestBed.inject(DisplaySettings);
    const root = document.documentElement;
    settings.toggleTheme();
    expect(root.classList.contains('theme-switching')).toBe(true);
    expect(root.dataset['theme']).toBe(settings.theme());
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(root.classList.contains('theme-switching')).toBe(false);
  });

  it('persists and restores the chosen reading size', () => {
    const settings = TestBed.inject(DisplaySettings);
    settings.setReadingSize('large');

    expect(localStorage.getItem('whylint-reading-size')).toBe('large');
    expect(document.documentElement.style.getPropertyValue('--reading-scale')).toBe('1.15');
    const restored = TestBed.runInInjectionContext(() => new DisplaySettings());
    expect(restored.readingSize()).toBe('large');

    restored.setReadingSize('larger');
    expect(document.documentElement.style.getPropertyValue('--reading-scale')).toBe('1.3');
    expect(document.documentElement.dataset['readingSize']).toBe('larger');
  });

  it('keeps reading size independent of language and theme changes', () => {
    const settings = TestBed.inject(DisplaySettings);
    settings.setReadingSize('larger');
    settings.setLanguage('en');
    settings.toggleTheme();

    expect(settings.readingSize()).toBe('larger');
    expect(localStorage.getItem('whylint-reading-size')).toBe('larger');
    expect(document.documentElement.style.getPropertyValue('--reading-scale')).toBe('1.3');
    expect(settings.language()).toBe('en');
  });

  it('falls back to standard for an unsupported saved size', () => {
    localStorage.setItem('whylint-reading-size', 'enormous');
    const settings = TestBed.inject(DisplaySettings);

    expect(settings.readingSize()).toBe('standard');
    expect(document.documentElement.style.getPropertyValue('--reading-scale')).toBe('1');
  });

  it('remains usable when preference storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Fixture storage is unavailable');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Fixture storage is unavailable');
    });
    const settings = TestBed.inject(DisplaySettings);
    settings.setReadingSize('large');

    expect(settings.readingSize()).toBe('large');
    expect(document.documentElement.style.getPropertyValue('--reading-scale')).toBe('1.15');
  });
});
