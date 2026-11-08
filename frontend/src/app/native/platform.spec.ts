import { isNativePlatform, nativeApiBaseUrl, nativePlatformName } from './platform';

type WithCapacitor = { Capacitor?: unknown };

describe('native platform detection', () => {
  afterEach(() => {
    delete (globalThis as WithCapacitor).Capacitor;
  });

  it('is a browser unless the shell injected Capacitor', () => {
    expect(isNativePlatform()).toBe(false);
    expect(nativePlatformName()).toBe('web');
  });

  it('reports the shell when Capacitor says it is native', () => {
    (globalThis as WithCapacitor).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'ios',
    };
    expect(isNativePlatform()).toBe(true);
    expect(nativePlatformName()).toBe('ios');
  });

  it('treats Capacitor running in a browser as web', () => {
    (globalThis as WithCapacitor).Capacitor = {
      isNativePlatform: () => false,
      getPlatform: () => 'web',
    };
    expect(isNativePlatform()).toBe(false);
  });

  it('does not trust anything but an explicit true, and survives a throwing global', () => {
    (globalThis as WithCapacitor).Capacitor = { isNativePlatform: () => 'yes' };
    expect(isNativePlatform()).toBe(false);
    (globalThis as WithCapacitor).Capacitor = {
      isNativePlatform: () => {
        throw new Error('broken bridge');
      },
      getPlatform: () => {
        throw new Error('broken bridge');
      },
    };
    expect(isNativePlatform()).toBe(false);
    expect(nativePlatformName()).toBe('web');
  });

  it('has no API address unless a native build defines one', () => {
    expect(nativeApiBaseUrl()).toBe('');
  });
});
