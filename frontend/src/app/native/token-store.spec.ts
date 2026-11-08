import { MemoryTokenStore, SecureTokenStore } from './token-store';

function fakePlugin(overrides: Record<string, unknown> = {}) {
  const items = new Map<string, string>();
  const storage = {
    setSynchronize: vi.fn().mockResolvedValue(undefined),
    setDefaultKeychainAccess: vi.fn().mockResolvedValue(undefined),
    setKeyPrefix: vi.fn().mockResolvedValue(undefined),
    getItem: vi.fn((key: string) => Promise.resolve(items.get(key) ?? null)),
    setItem: vi.fn((key: string, value: string) => {
      items.set(key, value);
      return Promise.resolve();
    }),
    removeItem: vi.fn((key: string) => {
      items.delete(key);
      return Promise.resolve(true);
    }),
    ...overrides,
  };
  const load = vi.fn().mockResolvedValue({
    SecureStorage: storage,
    KeychainAccess: { whenUnlockedThisDeviceOnly: 1 },
  });
  return { storage, items, load };
}

describe('SecureTokenStore', () => {
  it('never resolves a promise with the plugin itself, which Capacitor would call .then() on', async () => {
    const then = vi.fn(() => {
      throw new Error('"SecureStorage.then()" is not implemented');
    });
    const { storage, load } = fakePlugin();
    Object.defineProperty(storage, 'then', { get: then });
    const store = new SecureTokenStore(load);
    await store.write('token-1');
    await expect(store.read()).resolves.toBe('token-1');
    await store.clear();
    expect(then).not.toHaveBeenCalled();
  });

  it('keeps the token in the keystore and answers later reads from memory', async () => {
    const { storage, items, load } = fakePlugin();
    const store = new SecureTokenStore(load);
    await expect(store.read()).resolves.toBeNull();
    await store.write('token-1');
    expect([...items.values()]).toEqual(['token-1']);
    await expect(store.read()).resolves.toBe('token-1');
    expect(storage.getItem).toHaveBeenCalledTimes(1);
  });

  it('restores the token saved by an earlier launch', async () => {
    const { items, load } = fakePlugin();
    items.set('session-token', 'saved-token');
    await expect(new SecureTokenStore(load).read()).resolves.toBe('saved-token');
  });

  it('keeps tokens on this device only', async () => {
    const { storage, load } = fakePlugin();
    await new SecureTokenStore(load).read();
    expect(storage.setSynchronize).toHaveBeenCalledWith(false);
    expect(storage.setDefaultKeychainAccess).toHaveBeenCalledWith(1);
    expect(storage.setKeyPrefix).toHaveBeenCalledWith('whylint_');
  });

  it('forgets the token on clear', async () => {
    const { items, load } = fakePlugin();
    const store = new SecureTokenStore(load);
    await store.write('token-1');
    await store.clear();
    expect(items.size).toBe(0);
    await expect(store.read()).resolves.toBeNull();
  });

  it('lets a write made while the keystore loads win over the stored value', async () => {
    const { items, load } = fakePlugin();
    items.set('session-token', 'old-token');
    const store = new SecureTokenStore(load);
    const pendingRead = store.read();
    await store.write('new-token');
    await pendingRead;
    await expect(store.read()).resolves.toBe('new-token');
  });

  it('falls back to memory, never web storage, when the plugin cannot load', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const store = new SecureTokenStore(() => Promise.reject(new Error('no plugin')));
    await expect(store.read()).resolves.toBeNull();
    await store.write('token-1');
    await expect(store.read()).resolves.toBe('token-1');
    await store.clear();
    await expect(store.read()).resolves.toBeNull();
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it('keeps the session in memory when the keystore rejects a write or read', async () => {
    const { load } = fakePlugin({
      getItem: vi.fn().mockRejectedValue(new Error('keystore locked')),
      setItem: vi.fn().mockRejectedValue(new Error('keystore locked')),
      removeItem: vi.fn().mockRejectedValue(new Error('keystore locked')),
    });
    const store = new SecureTokenStore(load);
    await expect(store.read()).resolves.toBeNull();
    await expect(store.write('token-1')).resolves.toBeUndefined();
    await expect(store.read()).resolves.toBe('token-1');
    await expect(store.clear()).resolves.toBeUndefined();
    await expect(store.read()).resolves.toBeNull();
  });

  it('still reads and writes when the iOS-only options are rejected', async () => {
    const { items, load } = fakePlugin({
      setSynchronize: vi.fn().mockRejectedValue(new Error('not on Android')),
    });
    const store = new SecureTokenStore(load);
    await store.write('token-1');
    expect([...items.values()]).toEqual(['token-1']);
  });
});

describe('MemoryTokenStore', () => {
  it('holds one token', async () => {
    const store = new MemoryTokenStore();
    await expect(store.read()).resolves.toBeNull();
    await store.write('a');
    await expect(store.read()).resolves.toBe('a');
    await store.clear();
    await expect(store.read()).resolves.toBeNull();
  });
});
