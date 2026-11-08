import { InjectionToken } from '@angular/core';

/**
 * Where a native app keeps its session token. A browser never uses this: its session is an
 * HttpOnly cookie that scripts cannot read.
 */
export interface TokenStore {
  read(): Promise<string | null>;
  write(token: string): Promise<void>;
  clear(): Promise<void>;
}

const KEY = 'session-token';

type SecureStoragePlugin = typeof import('@aparajita/capacitor-secure-storage');
type Storage = SecureStoragePlugin['SecureStorage'];
// A Capacitor plugin is a Proxy that answers every property, including `then`. Resolving a promise
// with one makes JavaScript call plugin.then(), which the native side rejects. Always wrap it.
interface StorageHandle {
  storage: Storage;
}

/**
 * iOS Keychain / Android Keystore through @aparajita/capacitor-secure-storage. Items stay on this
 * device (no iCloud sync, no backup restore). If the keystore fails, the token is kept in memory so
 * the session lasts until the app restarts; it is never written to web storage.
 */
export class SecureTokenStore implements TokenStore {
  private memory: string | null = null;
  private loaded = false;
  private plugin: Promise<StorageHandle | null> | null = null;

  constructor(private readonly load: () => Promise<SecureStoragePlugin> = loadPlugin) {}

  async read(): Promise<string | null> {
    if (this.loaded) return this.memory;
    const handle = await this.storage();
    if (handle) {
      try {
        const saved = await handle.storage.getItem(KEY);
        // A write that happened while the keystore was loading wins.
        if (!this.loaded) this.memory = typeof saved === 'string' && saved ? saved : null;
      } catch (error) {
        this.report('read', error);
      }
    }
    this.loaded = true;
    return this.memory;
  }

  async write(token: string): Promise<void> {
    this.memory = token;
    this.loaded = true;
    const handle = await this.storage();
    try {
      await handle?.storage.setItem(KEY, token);
    } catch (error) {
      this.report('write', error);
    }
  }

  async clear(): Promise<void> {
    this.memory = null;
    this.loaded = true;
    const handle = await this.storage();
    try {
      await handle?.storage.removeItem(KEY);
    } catch (error) {
      this.report('clear', error);
    }
  }

  private storage(): Promise<StorageHandle | null> {
    this.plugin ??= this.load().then(
      async ({ SecureStorage, KeychainAccess }) => {
        try {
          await SecureStorage.setSynchronize(false);
          await SecureStorage.setDefaultKeychainAccess(KeychainAccess.whenUnlockedThisDeviceOnly);
          await SecureStorage.setKeyPrefix('whylint_');
        } catch (error) {
          this.report('configure', error);
        }
        return { storage: SecureStorage };
      },
      (error) => {
        this.report('load', error);
        return null;
      },
    );
    return this.plugin;
  }

  /** Says which keystore step failed so a signed-in session that does not survive a restart can be
   * diagnosed. It logs the step and the error message only, never the token. */
  private report(step: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Secure storage ${step} failed: ${message.slice(0, 200)}`);
  }
}

function loadPlugin(): Promise<SecureStoragePlugin> {
  // Loaded on demand so web visitors never download it.
  return import('@aparajita/capacitor-secure-storage');
}

export class MemoryTokenStore implements TokenStore {
  constructor(private token: string | null = null) {}
  read(): Promise<string | null> {
    return Promise.resolve(this.token);
  }
  write(token: string): Promise<void> {
    this.token = token;
    return Promise.resolve();
  }
  clear(): Promise<void> {
    this.token = null;
    return Promise.resolve();
  }
}

export const NATIVE_TOKEN_STORE = new InjectionToken<TokenStore>('NATIVE_TOKEN_STORE', {
  providedIn: 'root',
  factory: () => new SecureTokenStore(),
});
