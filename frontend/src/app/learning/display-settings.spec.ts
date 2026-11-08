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
