import { CALLBACK_PATH, createAuthorizationUrl, readCallback } from './oauth-flow';

describe('local Google sign-in', () => {
  it('builds an authorization request for the local callback', () => {
    const url = new URL(createAuthorizationUrl('test-client', 'http://localhost:4200', 'state-value'));
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('client_id')).toBe('test-client');
    expect(url.searchParams.get('redirect_uri')).toBe(`http://localhost:4200${CALLBACK_PATH}`);
    expect(url.searchParams.get('state')).toBe('state-value');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
  });

  it('accepts a code only when the callback state matches', () => {
    expect(readCallback('?state=expected&code=one-time-code', 'expected')).toEqual({ kind: 'code', code: 'one-time-code' });
    expect(readCallback('?state=other&code=one-time-code', 'expected')).toEqual({ kind: 'invalid' });
    expect(readCallback('?state=expected&code=one-time-code', null)).toEqual({ kind: 'invalid' });
    expect(readCallback('?state=expected&code=%20', 'expected')).toEqual({ kind: 'invalid' });
  });

  it('handles a matching cancellation without accepting a code', () => {
    expect(readCallback('?state=expected&error=access_denied', 'expected')).toEqual({ kind: 'cancelled' });
    expect(readCallback('?state=expected&error=server_error', 'expected')).toEqual({ kind: 'invalid' });
    expect(readCallback('?state=other&error=access_denied', 'expected')).toEqual({ kind: 'invalid' });
  });
});
