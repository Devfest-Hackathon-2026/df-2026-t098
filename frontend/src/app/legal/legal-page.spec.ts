import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { AUTH_FETCH } from '../auth/auth-session';
import { DisplaySettings } from '../learning/display-settings';
import { LEGAL_DOCUMENTS } from './legal-content';
import { LegalPage, legalBlocks } from './legal-page';

function render(kind: 'terms' | 'privacy', contact: string | null = null) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { data: { kind } } } },
      {
        provide: AUTH_FETCH,
        useValue: async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ legalBaseUrl: null, supportContact: contact }),
          }) as unknown as Response,
      },
    ],
  });
  const fixture = TestBed.createComponent(LegalPage);
  fixture.detectChanges();
  return fixture;
}

describe('Legal pages', () => {
  beforeEach(() => localStorage.removeItem('whylint-language'));

  it('shows the Terms of Service and links to the Privacy Policy', async () => {
    const fixture = render('terms');
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('h1')?.textContent).toBe('利用規約');
    expect(root.querySelectorAll('section h2').length).toBe(
      LEGAL_DOCUMENTS.terms.ja.sections.length + 1,
    );
    expect(root.querySelector('.other a')?.getAttribute('href')).toBe('/privacy');
  });

  it('shows the Privacy Policy in English after switching language', async () => {
    const fixture = render('privacy');
    TestBed.inject(DisplaySettings).setLanguage('en');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('h1')?.textContent).toBe('Privacy Policy');
    expect(root.textContent).toContain('Google Gemini');
    expect(root.querySelector('.other a')?.getAttribute('href')).toBe('/terms');
  });

  it('shows the configured public contact, else says it has not been published', async () => {
    const without = render('terms');
    await without.whenStable();
    without.detectChanges();
    expect((without.nativeElement as HTMLElement).querySelector('.contact')?.textContent).toContain(
      'サポートの連絡先はまだ公開されていません',
    );
    TestBed.resetTestingModule();
    const withContact = render('terms', 'help@example.test');
    await new Promise((done) => setTimeout(done, 0));
    await withContact.whenStable();
    withContact.detectChanges();
    expect(
      (withContact.nativeElement as HTMLElement).querySelector('.contact a')?.getAttribute('href'),
    ).toBe('mailto:help@example.test');
  });

  it('keeps every document complete in both languages', () => {
    for (const kind of ['terms', 'privacy'] as const) {
      const ja = LEGAL_DOCUMENTS[kind].ja;
      const en = LEGAL_DOCUMENTS[kind].en;
      expect(ja.sections.length).toBe(en.sections.length);
      for (const section of [...ja.sections, ...en.sections]) {
        expect(section.heading).not.toBe('');
        expect(section.body.length).toBeGreaterThan(0);
      }
    }
  });

  it('groups consecutive bullet lines into one list', () => {
    expect(legalBlocks({ heading: 'h', body: ['Intro', '• a', '• b', 'Outro'] })).toEqual([
      { list: false, lines: ['Intro'] },
      { list: true, lines: ['a', 'b'] },
      { list: false, lines: ['Outro'] },
    ]);
  });
});
