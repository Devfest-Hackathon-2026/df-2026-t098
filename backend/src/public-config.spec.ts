import { legalBaseUrl, publicConfig, supportContact } from './public-config';

describe('public configuration', () => {
  it.each([
    ['https://example.test', 'https://example.test'],
    ['https://example.test/', 'https://example.test'],
    ['  https://example.test/legal/  ', 'https://example.test/legal'],
    ['http://localhost:4200', 'http://localhost:4200'],
    ['http://127.0.0.1:3000/legal', 'http://127.0.0.1:3000/legal'],
  ])('accepts %s as the legal base URL', (value, expected) => {
    expect(legalBaseUrl(value)).toBe(expected);
  });

  it.each([
    undefined,
    '',
    'not a url',
    'http://example.test',
    'ftp://example.test',
    'javascript:alert(1)',
    'https://user:secret@example.test',
    'https://example.test/?token=1',
    'https://example.test/#fragment',
  ])('rejects %p instead of publishing an unsafe legal URL', (value) => {
    expect(legalBaseUrl(value)).toBeNull();
  });

  it('keeps a short single-line support contact and drops anything else', () => {
    expect(supportContact(' help@example.test ')).toBe('help@example.test');
    expect(supportContact('Visit https://example.test/support')).toBe(
      'Visit https://example.test/support',
    );
    expect(supportContact(undefined)).toBeNull();
    expect(supportContact('   ')).toBeNull();
    expect(supportContact('a\nb')).toBeNull();
    expect(supportContact('x'.repeat(121))).toBeNull();
  });

  it('reads both values from the environment and defaults to nothing', () => {
    expect(publicConfig({} as NodeJS.ProcessEnv)).toEqual({
      legalBaseUrl: null,
      supportContact: null,
    });
    expect(
      publicConfig({
        LEGAL_BASE_URL: 'https://example.test/',
        SUPPORT_CONTACT: 'help@example.test',
      } as unknown as NodeJS.ProcessEnv),
    ).toEqual({ legalBaseUrl: 'https://example.test', supportContact: 'help@example.test' });
  });
});
