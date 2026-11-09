import { TestBed } from '@angular/core/testing';
import { AUTH_FETCH } from '../auth/auth-session';
import { contactHref, PublicConfig, safeBaseUrl } from './public-config';

describe('public configuration', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  function config(): PublicConfig {
    TestBed.configureTestingModule({
      providers: [PublicConfig, { provide: AUTH_FETCH, useValue: fetchMock }],
    });
    return TestBed.inject(PublicConfig);
  }
  const reply = (body: unknown, ok = true) =>
    ({ ok, status: ok ? 200 : 503, json: async () => body }) as unknown as Response;

  beforeEach(() => {
    fetchMock = vi.fn();
  });

  it.each([
    ['https://legal.example/', 'https://legal.example'],
    ['https://legal.example/docs/', 'https://legal.example/docs'],
    ['http://localhost:4200', 'http://localhost:4200'],
  ])('accepts %s', (value, expected) => {
    expect(safeBaseUrl(value)).toBe(expected);
  });

  it.each([null, undefined, 42, '', 'not a url', 'javascript:alert(1)', 'https://u:p@legal.example'])(
    'drops %p',
    (value) => {
      expect(safeBaseUrl(value)).toBeNull();
    },
  );

  it('links an email as mailto, a web address as itself and plain text not at all', () => {
    expect(contactHref('help@example.test')).toBe('mailto:help@example.test');
    expect(contactHref('https://example.test/support')).toBe('https://example.test/support');
    expect(contactHref('Ask in the community')).toBeNull();
    expect(contactHref('javascript:alert(1)')).toBeNull();
  });

  it('publishes the legal pages and support contact from the server configuration', async () => {
    fetchMock.mockResolvedValue(
      reply({ legalBaseUrl: 'https://legal.example', supportContact: ' help@example.test ' }),
    );
    const settings = config();
    expect(settings.privacyUrl()).toBeNull();

    await settings.load();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/config',
      expect.objectContaining({ credentials: 'omit', referrerPolicy: 'no-referrer' }),
    );
    expect(settings.privacyUrl()).toBe('https://legal.example/privacy');
    expect(settings.termsUrl()).toBe('https://legal.example/terms');
    expect(settings.supportContact()).toBe('help@example.test');
    await settings.load();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shows nothing for unset or unsafe values', async () => {
    fetchMock.mockResolvedValue(
      reply({ legalBaseUrl: 'javascript:alert(1)', supportContact: 'x'.repeat(200) }),
    );
    const settings = config();
    await settings.load();
    expect(settings.privacyUrl()).toBeNull();
    expect(settings.termsUrl()).toBeNull();
    expect(settings.supportContact()).toBeNull();
  });

  it('asks again after a failed request', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(reply({ legalBaseUrl: 'https://legal.example', supportContact: null }));
    const settings = config();
    await settings.load();
    expect(settings.privacyUrl()).toBeNull();
    await settings.load();
    expect(settings.privacyUrl()).toBe('https://legal.example/privacy');
  });
});
