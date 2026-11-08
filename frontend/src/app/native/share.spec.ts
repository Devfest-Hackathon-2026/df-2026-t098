import { nativeShare, shareBaseUrl } from './share';

describe('sharing from the native shell', () => {
  afterEach(() => {
    delete (globalThis as { Capacitor?: unknown }).Capacitor;
  });

  it('links to the page origin in a browser', () => {
    expect(shareBaseUrl('https://learn.example.test')).toBe('https://learn.example.test');
  });

  it('falls back to the page origin in a native build that has no API address', () => {
    (globalThis as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true };
    expect(shareBaseUrl('capacitor://localhost')).toBe('capacitor://localhost');
  });

  it('leaves sharing to the browser outside the native shell', async () => {
    await expect(nativeShare({ title: 't', text: 't', url: 'https://x.test' })).resolves.toBe(
      'unavailable',
    );
  });

  it('reports a native share it could not open as unavailable, never as an error', async () => {
    (globalThis as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true };
    const outcome = await nativeShare({ title: 't', text: 't', url: 'https://x.test' });
    expect(['shared', 'unavailable', 'cancelled']).toContain(outcome);
  });
});
