import { createNativeFetch } from './native-fetch';
import { MemoryTokenStore } from './token-store';

const BASE = 'https://api.example.test';

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('createNativeFetch', () => {
  let fetchImpl: ReturnType<typeof vi.fn>;
  let tokens: MemoryTokenStore;
  let nativeFetch: typeof fetch;

  function sentHeaders(call = 0): Headers {
    return new Headers((fetchImpl.mock.calls[call][1] as RequestInit).headers);
  }

  beforeEach(() => {
    fetchImpl = vi.fn().mockResolvedValue(json(200, {}));
    tokens = new MemoryTokenStore();
    nativeFetch = createNativeFetch({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      baseUrl: BASE,
      tokens,
    });
  });

  it('sends relative API calls to the configured API without cookies', async () => {
    const controller = new AbortController();
    await nativeFetch('/api/v1/learning/progress?x=1', {
      method: 'POST',
      body: '{"a":1}',
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      `${BASE}/api/v1/learning/progress?x=1`,
      expect.objectContaining({
        method: 'POST',
        body: '{"a":1}',
        cache: 'no-store',
        credentials: 'omit',
        signal: controller.signal,
      }),
    );
  });

  it('adds the stored token as a Bearer header and keeps other headers', async () => {
    await tokens.write('token-1');
    await nativeFetch('/api/v1/auth/me', { headers: { 'Content-Type': 'application/json' } });
    expect(sentHeaders().get('Authorization')).toBe('Bearer token-1');
    expect(sentHeaders().get('Content-Type')).toBe('application/json');
  });

  it('sends no Authorization header while signed out', async () => {
    await nativeFetch('/api/v1/auth/me');
    expect(sentHeaders().has('Authorization')).toBe(false);
  });

  it('does not replace an Authorization header the caller set', async () => {
    await tokens.write('token-1');
    await nativeFetch('/api/v1/auth/me', { headers: { Authorization: 'Bearer other' } });
    expect(sentHeaders().get('Authorization')).toBe('Bearer other');
  });

  it('keeps the stored session when a different caller-supplied token is rejected', async () => {
    await tokens.write('token-1');
    fetchImpl.mockResolvedValue(json(401, {}));
    await nativeFetch('/api/v1/auth/me', { headers: { Authorization: 'Bearer other' } });
    await expect(tokens.read()).resolves.toBe('token-1');
    await nativeFetch('/api/v1/auth/logout', { headers: { Authorization: 'Bearer other' } });
    await expect(tokens.read()).resolves.toBe('token-1');
  });

  it('recognizes the stored token in a caller-supplied case-insensitive Bearer scheme', async () => {
    await tokens.write('expired-token');
    fetchImpl.mockResolvedValue(json(401, {}));
    await nativeFetch('/api/v1/auth/me', {
      headers: { Authorization: 'bEaReR\texpired-token' },
    });
    await expect(tokens.read()).resolves.toBeNull();
  });

  it('never rewrites or authenticates other URLs', async () => {
    await tokens.write('token-1');
    await nativeFetch('https://lh3.googleusercontent.com/avatar.png');
    await nativeFetch('/assets/logo.png');
    await nativeFetch(new URL('https://elsewhere.test/api/v1/auth/me'));
    expect(fetchImpl.mock.calls.map((call) => call[0])).toEqual([
      'https://lh3.googleusercontent.com/avatar.png',
      '/assets/logo.png',
      new URL('https://elsewhere.test/api/v1/auth/me'),
    ]);
    expect(fetchImpl.mock.calls.every((call) => call[1] === undefined)).toBe(true);
  });

  it.each([
    ['/api/v1/auth/signup', 201],
    ['/api/v1/auth/password/login', 200],
    ['/api/v1/auth/login', 200],
  ])(
    'stores the token a sign-in at %s returns, and still lets the caller read the body',
    async (path, status) => {
      fetchImpl.mockResolvedValue(json(status, { message: 'ok', token: 'issued-token' }));
      const response = await nativeFetch(path, { method: 'POST', body: '{}' });
      await expect(tokens.read()).resolves.toBe('issued-token');
      await expect(response.json()).resolves.toEqual({ message: 'ok', token: 'issued-token' });
    },
  );

  it('stores the token before the sign-in response reaches the caller', async () => {
    fetchImpl.mockResolvedValue(json(200, { message: 'ok', token: 'issued-token' }));
    await nativeFetch('/api/v1/auth/password/login', { method: 'POST', body: '{}' });
    // The very next request, made right after the response resolves, is already authenticated.
    fetchImpl.mockResolvedValue(json(200, {}));
    await nativeFetch('/api/v1/auth/me');
    expect(sentHeaders(1).get('Authorization')).toBe('Bearer issued-token');
  });

  it.each([
    ['a failed sign-in', json(401, { token: 'must-not-store' })],
    ['a body without a token', json(200, { message: 'ok' })],
    ['a token that is not a string', json(200, { token: 42 })],
    ['an empty token', json(200, { token: '' })],
    ['a body that is not JSON', new Response('<html>', { status: 200 })],
  ])('keeps the existing session after %s', async (_name, reply) => {
    await tokens.write('existing');
    fetchImpl.mockResolvedValue(reply);
    await nativeFetch('/api/v1/auth/password/login', { method: 'POST', body: '{}' });
    const stored = await tokens.read();
    // A 401 for the (valid) existing token would clear it, so only compare the non-401 cases.
    if (reply.status !== 401) expect(stored).toBe('existing');
    else expect(stored).not.toBe('must-not-store');
  });

  it('ignores a token in the body of requests that are not sign-ins', async () => {
    fetchImpl.mockResolvedValue(json(200, { token: 'not-from-sign-in' }));
    await nativeFetch('/api/v1/learning/progress');
    await expect(tokens.read()).resolves.toBeNull();
  });

  it('forgets the token when logging out, even if the server already dropped the session', async () => {
    await tokens.write('token-1');
    fetchImpl.mockResolvedValue(new Response(null, { status: 204 }));
    await nativeFetch('/api/v1/auth/logout', { method: 'POST' });
    await expect(tokens.read()).resolves.toBeNull();

    await tokens.write('token-2');
    fetchImpl.mockResolvedValue(json(401, {}));
    await nativeFetch('/api/v1/auth/logout', { method: 'POST' });
    await expect(tokens.read()).resolves.toBeNull();
  });

  it('keeps the token when logout fails for another reason', async () => {
    await tokens.write('token-1');
    fetchImpl.mockResolvedValue(json(503, {}));
    await nativeFetch('/api/v1/auth/logout', { method: 'POST' });
    await expect(tokens.read()).resolves.toBe('token-1');
  });

  it('keeps a newer sign-in when an earlier logout finishes', async () => {
    await tokens.write('old-token');
    let finish!: (response: Response) => void;
    fetchImpl.mockReturnValueOnce(new Promise<Response>((resolve) => (finish = resolve)));
    const logout = nativeFetch('/api/v1/auth/logout', { method: 'POST' });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledOnce());
    await tokens.write('new-token');
    finish(new Response(null, { status: 204 }));
    await logout;
    await expect(tokens.read()).resolves.toBe('new-token');
  });

  it('clears unavailable persisted storage on a signed-out logout response', async () => {
    const clear = vi.spyOn(tokens, 'clear');
    fetchImpl.mockResolvedValue(json(401, {}));
    await nativeFetch('/api/v1/auth/logout', { method: 'POST' });
    expect(clear).toHaveBeenCalledOnce();
  });

  it('forgets a token the server rejects', async () => {
    await tokens.write('expired');
    fetchImpl.mockResolvedValue(json(401, {}));
    await nativeFetch('/api/v1/auth/me');
    await expect(tokens.read()).resolves.toBeNull();
  });

  it('keeps the token through errors that are not about the session', async () => {
    await tokens.write('token-1');
    for (const status of [400, 403, 404, 429, 500, 503]) {
      fetchImpl.mockResolvedValue(json(status, {}));
      await nativeFetch('/api/v1/learning/progress');
    }
    await expect(tokens.read()).resolves.toBe('token-1');
  });

  it('does not clear a newer sign-in because an older request came back 401', async () => {
    await tokens.write('old-token');
    let reject401!: (response: Response) => void;
    fetchImpl.mockReturnValueOnce(new Promise<Response>((resolve) => (reject401 = resolve)));
    const stale = nativeFetch('/api/v1/auth/me');
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));

    await tokens.write('new-token');
    reject401(json(401, {}));
    await stale;
    await expect(tokens.read()).resolves.toBe('new-token');
  });

  it('does not send a token to the API for a guest 401', async () => {
    fetchImpl.mockResolvedValue(json(401, {}));
    await nativeFetch('/api/v1/auth/me');
    await expect(tokens.read()).resolves.toBeNull();
  });

  it('lets network errors reach the caller', async () => {
    fetchImpl.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(nativeFetch('/api/v1/auth/me')).rejects.toThrow('Failed to fetch');
  });
});
