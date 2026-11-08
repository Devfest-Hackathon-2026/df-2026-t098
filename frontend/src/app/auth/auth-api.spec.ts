import { TestBed } from '@angular/core/testing';
import { AUTH_FETCH, AuthSession } from './auth-session';
import { AuthApi } from './auth-api';
import { validSignupPassword, validUsername } from './auth-validation';

describe('AuthApi', () => {
  let request: ReturnType<typeof vi.fn>;
  let refresh: ReturnType<typeof vi.fn>;
  let api: AuthApi;
  beforeEach(() => {
    request = vi.fn();
    refresh = vi.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        { provide: AUTH_FETCH, useValue: request },
        { provide: AuthSession, useValue: { refresh } },
      ],
    });
    api = TestBed.inject(AuthApi);
  });
  afterEach(() => vi.useRealTimers());

  it('signs up with unchanged password bytes, credentials and a verified restored profile', async () => {
    request.mockResolvedValue({ status: 201, text: async () => '{}' });
    const data = {
      email: 'learner@example.test',
      username: '学習者_1',
      password: '  fixture passphrase  ',
    };
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    await expect(api.signup(data)).resolves.toEqual({ ok: true });
    expect(request).toHaveBeenCalledWith(
      '/api/v1/auth/signup',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        referrerPolicy: 'no-referrer',
        body: JSON.stringify(data),
      }),
    );
    expect(refresh).toHaveBeenCalledOnce();
    expect(storage).not.toHaveBeenCalled();
    storage.mockRestore();
  });

  it('uses the authenticated username route and never sends a client-supplied user ID', async () => {
    request.mockResolvedValue({ status: 200, text: async () => '{}' });
    await expect(api.setUsername('learner_1')).resolves.toEqual({ ok: true });
    expect(request).toHaveBeenCalledWith(
      '/api/v1/auth/me/username',
      expect.objectContaining({ method: 'PATCH', body: '{"username":"learner_1"}' }),
    );
  });

  it.each([
    [400, 'invalid'],
    [409, 'conflict'],
    [429, 'rateLimit'],
    [503, 'unavailable'],
  ])(
    'returns a localizable failure for HTTP %s without trusting backend messages',
    async (status, reason) => {
      request.mockResolvedValue({ status });
      await expect(api.passwordLogin('learner', 'fixture password')).resolves.toEqual({
        ok: false,
        reason,
      });
      expect(refresh).not.toHaveBeenCalled();
    },
  );

  it('refreshes expired profile sessions but treats a bad password as a guest failure', async () => {
    request.mockResolvedValue({ status: 401 });
    await expect(api.passwordLogin('learner', 'fixture password')).resolves.toEqual({
      ok: false,
      reason: 'unauthorized',
    });
    expect(refresh).not.toHaveBeenCalled();
    await api.setUsername('learner');
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('does not claim success when the issued session cannot be restored', async () => {
    request.mockResolvedValue({ status: 201, text: async () => '{}' });
    refresh.mockResolvedValue(false);
    await expect(
      api.signup({
        email: 'learner@example.test',
        username: 'learner',
        password: 'fixture passphrase',
      }),
    ).resolves.toEqual({ ok: false, reason: 'unavailable' });
  });

  it('aborts a stalled mutation and ignores a late success', async () => {
    vi.useFakeTimers();
    let resolve!: (value: unknown) => void;
    request.mockReturnValue(
      new Promise((finish) => {
        resolve = finish;
      }),
    );
    const pending = api.setUsername('learner');
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(pending).resolves.toEqual({ ok: false, reason: 'unavailable' });
    expect(request.mock.calls[0][1].signal.aborted).toBe(true);
    resolve({ status: 200 });
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('validates Unicode character counts without normalizing passwords', () => {
    expect(validUsername('  学習者_1  ')).toBe(true);
    expect(validUsername('name@example.test')).toBe(false);
    expect(validUsername('ab')).toBe(false);
    // U+1F331 is one character outside the BMP; it counts once, not as two UTF-16 units.
    expect(validSignupPassword('\u{1F331}'.repeat(15))).toBe(true);
    expect(validSignupPassword('\u{1F331}'.repeat(129))).toBe(false);
    expect(validSignupPassword('short')).toBe(false);
  });

  it('bounds reading a mutation response body before refreshing the session', async () => {
    vi.useFakeTimers();
    request.mockResolvedValue({ status: 200, text: () => new Promise(() => {}) });
    const pending = api.setUsername('learner');
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(pending).resolves.toEqual({ ok: false, reason: 'unavailable' });
    expect(refresh).not.toHaveBeenCalled();
  });
});
