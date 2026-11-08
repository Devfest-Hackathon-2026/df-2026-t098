import type { TokenStore } from './token-store';

const SIGN_IN_PATHS = [
  '/api/v1/auth/signup',
  '/api/v1/auth/password/login',
  '/api/v1/auth/login',
  '/api/v1/auth/google/native',
];
const LOGOUT_PATH = '/api/v1/auth/logout';

export interface NativeFetchOptions {
  fetchImpl: typeof fetch;
  baseUrl: string;
  tokens: TokenStore;
}

/**
 * A fetch for the Capacitor shell. The app's files come from capacitor://localhost or
 * https://localhost, so the API is a different origin and the SameSite session cookie does not
 * apply. Instead:
 *  - relative `/api/...` requests are sent to the configured API address,
 *  - the stored token goes out as `Authorization: Bearer`,
 *  - the token a sign-in returns is stored before the caller sees the response,
 *  - logout, or a 401 for the stored token, forgets it.
 * Other absolute URLs pass through untouched and never receive the token.
 */
export function createNativeFetch({
  fetchImpl,
  baseUrl,
  tokens,
}: NativeFetchOptions): typeof fetch {
  return async (input, init) => {
    const target = typeof input === 'string' ? input : null;
    // Only the app's own relative API calls are rewritten and authenticated.
    if (target === null || !target.startsWith('/api/')) return fetchImpl(input, init);

    const token = await tokens.read();
    const headers = new Headers(init?.headers);
    if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
    const authorization = headers.get('Authorization');
    const sentToken = authorization?.match(/^Bearer[ \t]+([^\s]+)$/i)?.[1];
    const sentStoredToken = !!token && sentToken === token;
    const response = await fetchImpl(baseUrl + target, { ...init, headers, credentials: 'omit' });

    const path = target.split('?', 1)[0];
    if (SIGN_IN_PATHS.includes(path) && response.ok) {
      const issued = await readIssuedToken(response);
      if (issued) await tokens.write(issued);
    } else if (
      path === LOGOUT_PATH &&
      (response.ok || response.status === 401) &&
      (sentStoredToken || authorization === null) &&
      (await tokens.read()) === token
    ) {
      await tokens.clear();
    } else if (sentStoredToken && response.status === 401 && (await tokens.read()) === token) {
      // The server no longer accepts this token. Skip the clear if a newer sign-in replaced it.
      await tokens.clear();
    }
    return response;
  };
}

async function readIssuedToken(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.clone().json();
    const token = (body as { token?: unknown } | null)?.token;
    return typeof token === 'string' && token ? token : null;
  } catch {
    return null;
  }
}
