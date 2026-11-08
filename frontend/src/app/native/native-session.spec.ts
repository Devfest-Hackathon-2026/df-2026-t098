import { TestBed } from '@angular/core/testing';
import { AUTH_FETCH } from '../auth/auth-session';
import { MemoryTokenStore, NATIVE_TOKEN_STORE } from './token-store';

describe('AUTH_FETCH', () => {
  let nativeFetchTarget: ReturnType<typeof vi.fn>;
  let original: typeof fetch;

  beforeEach(() => {
    original = globalThis.fetch;
    nativeFetchTarget = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    globalThis.fetch = nativeFetchTarget as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = original;
    delete (globalThis as { Capacitor?: unknown }).Capacitor;
    vi.restoreAllMocks();
  });

  it('is the plain browser fetch on the web: same origin, no token handling', async () => {
    const request = TestBed.inject(AUTH_FETCH);
    await request('/api/v1/auth/me', { credentials: 'same-origin' });
    expect(nativeFetchTarget).toHaveBeenCalledWith('/api/v1/auth/me', {
      credentials: 'same-origin',
    });
  });

  it('authenticates with the stored token and omits cookies in the native shell', async () => {
    (globalThis as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true };
    const tokens = new MemoryTokenStore('native-token');
    TestBed.configureTestingModule({
      providers: [{ provide: NATIVE_TOKEN_STORE, useValue: tokens }],
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const request = TestBed.inject(AUTH_FETCH);
    await request('/api/v1/auth/me', { credentials: 'same-origin' });

    const [url, init] = nativeFetchTarget.mock.calls[0] as [string, RequestInit];
    expect(url.endsWith('/api/v1/auth/me')).toBe(true);
    expect(init.credentials).toBe('omit');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer native-token');
  });

  it('says so when a native build was made without an API address', () => {
    (globalThis as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true };
    TestBed.configureTestingModule({
      providers: [{ provide: NATIVE_TOKEN_STORE, useValue: new MemoryTokenStore() }],
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    TestBed.inject(AUTH_FETCH);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('native:build'));
  });
});
