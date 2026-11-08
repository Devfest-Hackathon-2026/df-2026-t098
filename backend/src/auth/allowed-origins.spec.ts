import {
  corsOrigins,
  isNativeAppOrigin,
  nativeAppOrigins,
  parseNativeAppOrigins,
  webOrigin,
} from './allowed-origins';

describe('native app origins', () => {
  const original = {
    native: process.env.NATIVE_APP_ORIGINS,
    web: process.env.FRONTEND_URL,
  };

  afterEach(() => {
    if (original.native === undefined) delete process.env.NATIVE_APP_ORIGINS;
    else process.env.NATIVE_APP_ORIGINS = original.native;
    if (original.web === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = original.web;
  });

  it('is empty by default, so a web-only deployment accepts nothing extra', () => {
    delete process.env.NATIVE_APP_ORIGINS;
    expect(nativeAppOrigins()).toEqual([]);
    expect(isNativeAppOrigin('capacitor://localhost')).toBe(false);
  });

  it('parses the Capacitor origins, trimming, lower-casing and removing duplicates', () => {
    expect(
      parseNativeAppOrigins(
        ' capacitor://localhost , HTTPS://localhost,capacitor://localhost,',
      ),
    ).toEqual({
      origins: ['capacitor://localhost', 'https://localhost'],
      invalid: [],
    });
  });

  it('accepts ports and ionic://', () => {
    expect(
      parseNativeAppOrigins('http://localhost:8100,ionic://localhost').origins,
    ).toEqual(['http://localhost:8100', 'ionic://localhost']);
  });

  it.each([
    '*',
    'localhost',
    'capacitor://localhost/',
    'capacitor://localhost/path',
    'https://localhost?x=1',
    'https://user@localhost',
    'https://*.example.com',
    'javascript:alert(1)',
    'file://localhost',
    'https://localhost:99999999',
    'https://',
  ])('reports %s as invalid instead of allowing it', (entry) => {
    expect(parseNativeAppOrigins(entry)).toEqual({
      origins: [],
      invalid: [entry],
    });
  });

  it('matches only exact origins', () => {
    process.env.NATIVE_APP_ORIGINS = 'capacitor://localhost,https://localhost';
    expect(isNativeAppOrigin('capacitor://localhost')).toBe(true);
    expect(isNativeAppOrigin('https://localhost')).toBe(true);
    for (const origin of [
      'http://localhost',
      'https://localhost:4200',
      'capacitor://localhost.evil.test',
      'https://evil.test',
      'null',
      '',
      undefined,
      42,
    ])
      expect(isNativeAppOrigin(origin)).toBe(false);
  });

  it('builds the CORS list from the web origin and the native origins', () => {
    process.env.FRONTEND_URL = 'https://learn.example.test/app';
    process.env.NATIVE_APP_ORIGINS = 'capacitor://localhost';
    expect(corsOrigins()).toEqual([
      'https://learn.example.test',
      'capacitor://localhost',
    ]);
  });

  it('keeps CORS off when nothing is configured', () => {
    delete process.env.FRONTEND_URL;
    delete process.env.NATIVE_APP_ORIGINS;
    expect(corsOrigins()).toEqual([]);
  });

  it('reads only http(s) URLs as the web origin', () => {
    expect(webOrigin('http://localhost:4200/x')).toBe('http://localhost:4200');
    expect(webOrigin('capacitor://localhost')).toBeNull();
    expect(webOrigin('data:text/plain,hello')).toBeNull();
    expect(webOrigin('')).toBeNull();
    expect(webOrigin(undefined)).toBeNull();
  });
});
