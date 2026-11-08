import { TestBed } from '@angular/core/testing';
import { AUTH_FETCH, AuthSession } from './auth-session';

describe('AuthSession', () => {
  const account = {
    id: 'user-id',
    email: 'user@example.com',
    name: 'Example User',
    avatarUrl: null,
    username: null,
  };
  let fetchMock: ReturnType<typeof vi.fn>;
  let session: AuthSession;

  function response(status: number, body?: unknown): Response {
    return {
      status,
      ok: status >= 200 && status < 300,
      json: vi.fn().mockResolvedValue(body),
    } as unknown as Response;
  }

  function createSession(): AuthSession {
    TestBed.configureTestingModule({
      providers: [AuthSession, { provide: AUTH_FETCH, useValue: fetchMock }],
    });
    return TestBed.inject(AuthSession);
  }

  beforeEach(() => {
    fetchMock = vi.fn();
    session = createSession();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('restores a validated user from the cookie-backed endpoint', async () => {
    fetchMock.mockResolvedValueOnce(response(200, account));

    await expect(session.refresh()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/auth/me',
      expect.objectContaining({ credentials: 'same-origin', referrerPolicy: 'no-referrer' }),
    );
    expect(session.status()).toBe('authenticated');
    expect(session.user()).toEqual(account);
  });

  it('signs out through the cookie-backed endpoint without clearing learning preferences', async () => {
    fetchMock.mockResolvedValueOnce(response(200, account));
    await session.refresh();
    const remove = vi.spyOn(Storage.prototype, 'removeItem');
    const clear = vi.spyOn(Storage.prototype, 'clear');
    fetchMock.mockResolvedValueOnce(response(204));

    await expect(session.logout()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/v1/auth/logout',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        referrerPolicy: 'no-referrer',
      }),
    );
    expect(session.status()).toBe('guest');
    expect(session.user()).toBeNull();
    expect(session.loggingOut()).toBe(false);
    expect(remove).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });

  it.each(['http', 'network'])(
    'keeps the account and permits retry after a logout %s failure',
    async (failure) => {
      fetchMock.mockResolvedValueOnce(response(200, account));
      await session.refresh();
      if (failure === 'http') fetchMock.mockResolvedValueOnce(response(503));
      else fetchMock.mockRejectedValueOnce(new Error('connection failed'));

      await expect(session.logout()).resolves.toBe(false);
      expect(session.status()).toBe('authenticated');
      expect(session.user()).toEqual(account);
      expect(session.loggingOut()).toBe(false);
      fetchMock.mockResolvedValueOnce(response(204));
      await expect(session.logout()).resolves.toBe(true);
    },
  );

  it('shares a pending logout and makes concurrent refresh wait for its result', async () => {
    fetchMock.mockResolvedValueOnce(response(200, account));
    await session.refresh();
    let resolveLogout!: (value: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveLogout = resolve;
      }),
    );

    const logout = session.logout();
    expect(session.logout()).toBe(logout);
    expect(session.loggingOut()).toBe(true);
    const refresh = session.refresh();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    resolveLogout(response(204));
    await expect(logout).resolves.toBe(true);
    await expect(refresh).resolves.toBe(false);
    expect(session.status()).toBe('guest');
  });

  it('prevents a previously started session check from restoring the account after logout', async () => {
    fetchMock.mockResolvedValueOnce(response(200, account));
    await session.refresh();
    let resolveOlder!: (value: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveOlder = resolve;
      }),
    );
    const older = session.refresh();
    fetchMock.mockResolvedValueOnce(response(204));

    await session.logout();
    resolveOlder(response(200, account));
    await older;
    expect(session.status()).toBe('guest');
    expect(session.user()).toBeNull();
  });

  it('keeps the known account usable if logout fails while a refresh is being cancelled', async () => {
    fetchMock.mockResolvedValueOnce(response(200, account));
    await session.refresh();
    let resolveOlder!: (value: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveOlder = resolve;
      }),
    );
    const older = session.refresh();
    fetchMock.mockRejectedValueOnce(new Error('connection failed'));

    await expect(session.logout()).resolves.toBe(false);
    expect(session.status()).toBe('authenticated');
    expect(session.user()).toEqual(account);
    resolveOlder(response(401));
    await older;
    expect(session.status()).toBe('authenticated');
  });

  it('bounds logout duration and ignores a late successful response', async () => {
    fetchMock.mockResolvedValueOnce(response(200, account));
    await session.refresh();
    vi.useFakeTimers();
    let resolveLate!: (value: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveLate = resolve;
      }),
    );
    const logout = session.logout();
    const signal = (fetchMock.mock.calls[1][1] as RequestInit).signal;
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(logout).resolves.toBe(false);
    expect(signal?.aborted).toBe(true);
    expect(session.status()).toBe('authenticated');
    expect(session.loggingOut()).toBe(false);
    resolveLate(response(204));
    await vi.advanceTimersByTimeAsync(0);
    expect(session.status()).toBe('authenticated');
  });

  it('loads the user again in a fresh application instance', async () => {
    fetchMock.mockResolvedValue(response(200, account));
    await session.refresh();
    TestBed.resetTestingModule();

    const reloadedSession = createSession();
    expect(reloadedSession).not.toBe(session);
    await expect(reloadedSession.refresh()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(reloadedSession.user()).toEqual(account);
    expect(reloadedSession.status()).toBe('authenticated');
  });

  it('treats a 401 as a signed-out user', async () => {
    fetchMock.mockResolvedValueOnce(response(401));

    await expect(session.refresh()).resolves.toBe(false);
    expect(session.status()).toBe('guest');
    expect(session.user()).toBeNull();
  });

  it('treats server and network failures as unavailable, not a confirmed sign-out', async () => {
    fetchMock.mockResolvedValueOnce(response(500));
    await expect(session.refresh()).resolves.toBe(false);
    expect(session.status()).toBe('unavailable');
    expect(session.user()).toBeNull();

    fetchMock.mockRejectedValueOnce(new Error('network down'));
    await expect(session.refresh()).resolves.toBe(false);
    expect(session.status()).toBe('unavailable');
    expect(session.user()).toBeNull();
  });

  it('reports loading while checking the session', async () => {
    let resolveRequest!: (value: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveRequest = resolve;
      }),
    );

    const pending = session.refresh();
    expect(session.status()).toBe('loading');
    resolveRequest(response(401));
    await pending;
    expect(session.status()).toBe('guest');
  });

  it.each([
    null,
    {},
    { ...account, id: 123 },
    { ...account, email: null },
    { ...account, avatarUrl: 42 },
    { ...account, username: 42 },
  ])('rejects a malformed user response', async (body) => {
    fetchMock.mockResolvedValueOnce(response(200, body));

    await expect(session.refresh()).resolves.toBe(false);
    expect(session.status()).toBe('unavailable');
    expect(session.user()).toBeNull();
  });

  it('treats an unreadable response as unavailable', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('bad JSON');
      },
    });

    await expect(session.refresh()).resolves.toBe(false);
    expect(session.status()).toBe('unavailable');
    expect(session.user()).toBeNull();
  });

  it('does not let an older success overwrite a newer signed-out response', async () => {
    let resolveOlder!: (value: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveOlder = resolve;
      }),
    );
    fetchMock.mockResolvedValueOnce(response(401));

    const older = session.refresh();
    const newer = session.refresh();
    await expect(newer).resolves.toBe(false);
    resolveOlder(response(200, account));
    await expect(older).resolves.toBe(false);

    expect(session.status()).toBe('guest');
    expect(session.user()).toBeNull();
  });

  it('does not let an older 401 overwrite a newer authenticated response', async () => {
    let resolveOlder!: (value: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveOlder = resolve;
      }),
    );
    fetchMock.mockResolvedValueOnce(response(200, account));

    const older = session.refresh();
    const newer = session.refresh();
    await expect(newer).resolves.toBe(true);
    resolveOlder(response(401));
    await expect(older).resolves.toBe(true);

    expect(session.status()).toBe('authenticated');
    expect(session.user()).toEqual(account);
  });

  it('does not write the user or credentials to browser storage', async () => {
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem');
    fetchMock.mockResolvedValueOnce(response(200, account));

    await session.refresh();

    expect(storageWrite).not.toHaveBeenCalled();
  });

  it('times out and aborts a hung fetch without accepting a late response', async () => {
    vi.useFakeTimers();
    let resolveLate!: (value: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveLate = resolve;
      }),
    );

    const pending = session.refresh();
    const signal = (fetchMock.mock.calls[0][1] as RequestInit).signal;
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(pending).resolves.toBe(false);
    expect(signal?.aborted).toBe(true);
    expect(session.status()).toBe('unavailable');
    expect(session.user()).toBeNull();

    resolveLate(response(200, account));
    await vi.advanceTimersByTimeAsync(0);
    expect(session.status()).toBe('unavailable');
    expect(session.user()).toBeNull();
  });

  it('times out while reading the response body and ignores a late body', async () => {
    vi.useFakeTimers();
    let resolveBody!: (value: unknown) => void;
    const json = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveBody = resolve;
        }),
    );
    fetchMock.mockResolvedValueOnce({ status: 200, ok: true, json });

    const pending = session.refresh();
    await vi.advanceTimersByTimeAsync(0);
    expect(json).toHaveBeenCalledOnce();
    const signal = (fetchMock.mock.calls[0][1] as RequestInit).signal;
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(pending).resolves.toBe(false);
    expect(signal?.aborted).toBe(true);
    expect(session.status()).toBe('unavailable');
    resolveBody(account);
    await vi.advanceTimersByTimeAsync(0);
    expect(session.status()).toBe('unavailable');
    expect(session.user()).toBeNull();
  });

  it('lets a newer refresh win when an older request is superseded', async () => {
    vi.useFakeTimers();
    let resolveOlder!: (value: Response) => void;
    let resolveNewer!: (value: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveOlder = resolve;
      }),
    );
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveNewer = resolve;
      }),
    );

    const older = session.refresh();
    const olderSignal = (fetchMock.mock.calls[0][1] as RequestInit).signal;
    let olderFinished = false;
    void older.then(() => {
      olderFinished = true;
    });
    await vi.advanceTimersByTimeAsync(5_000);
    const newer = session.refresh();
    expect(olderSignal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(olderFinished).toBe(false);
    expect(session.status()).toBe('loading');
    resolveNewer(response(200, account));
    await expect(newer).resolves.toBe(true);
    await expect(older).resolves.toBe(true);
    resolveOlder(response(401));
    await vi.advanceTimersByTimeAsync(0);
    expect(session.status()).toBe('authenticated');
    expect(session.user()).toEqual(account);
  });

  it('resolves a hung older check as soon as its replacement succeeds', async () => {
    vi.useFakeTimers();
    fetchMock.mockReturnValueOnce(new Promise<Response>(() => {}));
    fetchMock.mockResolvedValueOnce(response(200, account));

    const older = session.refresh();
    const olderSignal = (fetchMock.mock.calls[0][1] as RequestInit).signal;
    const newer = session.refresh();

    expect(olderSignal?.aborted).toBe(true);
    await expect(newer).resolves.toBe(true);
    await expect(older).resolves.toBe(true);
    expect(session.status()).toBe('authenticated');
    expect(session.user()).toEqual(account);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('settles a chain of superseded checks using the newest result', async () => {
    vi.useFakeTimers();
    fetchMock.mockReturnValueOnce(new Promise<Response>(() => {}));
    fetchMock.mockReturnValueOnce(new Promise<Response>(() => {}));
    fetchMock.mockResolvedValueOnce(response(200, account));

    const first = session.refresh();
    const firstSignal = (fetchMock.mock.calls[0][1] as RequestInit).signal;
    const second = session.refresh();
    const secondSignal = (fetchMock.mock.calls[1][1] as RequestInit).signal;
    const third = session.refresh();

    expect(firstSignal?.aborted).toBe(true);
    expect(secondSignal?.aborted).toBe(true);
    await expect(Promise.all([first, second, third])).resolves.toEqual([true, true, true]);
    expect(session.status()).toBe('authenticated');
    expect(session.user()).toEqual(account);
    expect(vi.getTimerCount()).toBe(0);
  });
});
