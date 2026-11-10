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

describe('First language', () => {
  const setBrowser = (language: string) =>
    Object.defineProperty(window.navigator, 'language', { value: language, configurable: true });

  afterEach(() => {
    setBrowser('ja-JP');
    localStorage.removeItem('whylint-language');
    localStorage.removeItem('whylint-language-detected');
  });

  it.each([
    ['ja-JP', 'ja'],
    ['en-US', 'en'],
    ['fr-FR', 'en'],
  ])('uses the browser language %s as %s when nothing is saved', (browser, expected) => {
    localStorage.removeItem('whylint-language');
    setBrowser(browser);
    TestBed.configureTestingModule({});
    expect(TestBed.inject(DisplaySettings).language()).toBe(expected);
  });

  it('prefers the saved choice over the browser language', () => {
    localStorage.setItem('whylint-language', 'ja');
    setBrowser('en-US');
    TestBed.configureTestingModule({});
    expect(TestBed.inject(DisplaySettings).language()).toBe('ja');
  });

  it('uses a country suggestion once and remembers it on the next launch', async () => {
    setBrowser('en-US');
    TestBed.configureTestingModule({});
    const request = vi.fn(async () => Response.json({ defaultLanguage: 'ja' }));
    const settings = TestBed.inject(DisplaySettings);
    await Promise.all([settings.resolveDefaultLanguage(request), settings.resolveDefaultLanguage(request)]);
    expect(request).toHaveBeenCalledOnce();
    expect(settings.language()).toBe('ja');
    expect(localStorage.getItem('whylint-language')).toBeNull();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const relaunched = TestBed.inject(DisplaySettings);
    expect(relaunched.language()).toBe('ja');
    expect(relaunched.resolveDefaultLanguage(request)).toBeUndefined();
  });

  it('does not look up a country when a saved preference already exists', () => {
    localStorage.setItem('whylint-language', 'en');
    localStorage.setItem('whylint-language-detected', 'ja');
    TestBed.configureTestingModule({});
    const request = vi.fn();
    const settings = TestBed.inject(DisplaySettings);
    expect(settings.language()).toBe('en');
    expect(settings.resolveDefaultLanguage(request)).toBeUndefined();
    expect(request).not.toHaveBeenCalled();
  });

  it('keeps a language chosen while the lookup is pending', async () => {
    TestBed.configureTestingModule({});
    let reply!: (response: Response) => void;
    const request = () => new Promise<Response>((resolve) => { reply = resolve; });
    const settings = TestBed.inject(DisplaySettings);
    const pending = settings.resolveDefaultLanguage(request);
    settings.setLanguage('en');
    reply(Response.json({ defaultLanguage: 'ja' }));
    await pending;
    expect(settings.language()).toBe('en');
    expect(localStorage.getItem('whylint-language-detected')).toBeNull();
  });

  it('keeps the device fallback when the country is unavailable', async () => {
    setBrowser('ja-JP');
    TestBed.configureTestingModule({});
    const settings = TestBed.inject(DisplaySettings);
    await settings.resolveDefaultLanguage(async () => Response.json({ defaultLanguage: null }));
    expect(settings.language()).toBe('ja');
    expect(localStorage.getItem('whylint-language-detected')).toBeNull();
  });
});
