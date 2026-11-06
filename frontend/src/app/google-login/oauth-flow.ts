export const STATE_KEY = 'whylint-google-auth-state';
export const CALLBACK_PATH = '/auth/google/callback';

export function createAuthorizationUrl(clientId: string, origin: string, state: string): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin}${CALLBACK_PATH}`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
  }).toString();
  return url.toString();
}

export type CallbackResult = { kind: 'code'; code: string } | { kind: 'cancelled' } | { kind: 'invalid' };

export function readCallback(search: string, expectedState: string | null): CallbackResult {
  const query = new URLSearchParams(search);
  const state = query.get('state');
  if (!expectedState || !state || state !== expectedState) return { kind: 'invalid' };
  if (query.get('error') === 'access_denied') return { kind: 'cancelled' };
  if (query.has('error')) return { kind: 'invalid' };
  const code = query.get('code');
  return code?.trim() ? { kind: 'code', code } : { kind: 'invalid' };
}
