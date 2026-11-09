import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AuthOriginGuard } from './origin.guard';

describe('AuthOriginGuard', () => {
  const guard = new AuthOriginGuard();
  const originalFrontendUrl = process.env.FRONTEND_URL;

  function contextFor(origin?: string, request: Record<string, unknown> = {}): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ headers: { origin }, ...request }),
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    process.env.FRONTEND_URL = 'http://localhost:4200';
  });

  afterAll(() => {
    if (originalFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = originalFrontendUrl;
  });

  it('allows the exact configured frontend origin', () => {
    expect(guard.canActivate(contextFor('http://localhost:4200'))).toBe(true);
  });

  it('compares against the configured URL origin', () => {
    process.env.FRONTEND_URL = 'https://example.test/app';
    expect(guard.canActivate(contextFor('https://example.test'))).toBe(true);
  });

  it('allows an already-validated bearer session to write without browser cookies', () => {
    const req = {
      method: 'PUT', path: '/api/v1/learning/preferences',
      user: { sub: 'verified-user', sid: 'verified-session' },
      headers: { authorization: 'Bearer verified-token' },
    };
    expect(guard.canActivate(contextFor(undefined, req))).toBe(true);
    expect(() => guard.canActivate(contextFor(undefined, { ...req, user: undefined }))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextFor(undefined, {
      ...req, headers: { ...req.headers, cookie: 'access_token=ambient' },
    }))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextFor(undefined, {
      ...req, headers: { ...req.headers, origin: 'https://untrusted.example' },
    }))).toThrow(ForbiddenException);
  });

  it('lets a bearer session delete its account without an Origin, but never with a cookie', () => {
    const req = {
      method: 'DELETE', path: '/api/v1/auth/me',
      user: { sub: 'verified-user', sid: 'verified-session' },
      headers: { authorization: 'Bearer verified-token' },
    };
    expect(guard.canActivate(contextFor(undefined, req))).toBe(true);
    expect(() => guard.canActivate(contextFor(undefined, {
      ...req, headers: { ...req.headers, cookie: 'access_token=ambient' },
    }))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextFor(undefined, {
      ...req, cookies: { access_token: 'ambient' },
    }))).toThrow(ForbiddenException);
    // A browser cookie session must come from the web origin.
    expect(() => guard.canActivate(contextFor('https://untrusted.example', {
      method: 'DELETE', path: '/api/v1/auth/me', user: req.user,
      headers: { cookie: 'access_token=session', origin: 'https://untrusted.example' },
    }))).toThrow(ForbiddenException);
    expect(guard.canActivate(contextFor('http://localhost:4200', {
      method: 'DELETE', path: '/api/v1/auth/me', user: req.user,
      headers: { cookie: 'access_token=session', origin: 'http://localhost:4200' },
    }))).toBe(true);
  });

  it.each([
    undefined,
    'null',
    'http://localhost:4201',
    'https://localhost:4200',
    'http://localhost:4200.evil.test',
  ])('rejects an absent or untrusted origin', (origin) => {
    expect(() => guard.canActivate(contextFor(origin))).toThrow(ForbiddenException);
  });

  it.each([undefined, '', 'not-a-url', 'data:text/plain,hello'])(
    'fails closed for missing or invalid configuration',
    (configuredUrl) => {
      if (configuredUrl === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = configuredUrl;
      expect(() => guard.canActivate(contextFor('http://localhost:4200'))).toThrow(
        ForbiddenException,
      );
    },
  );

  it('allows only a bearer-only logout to omit Origin', () => {
    const request = {
      method: 'POST',
      path: '/api/v1/auth/logout',
      headers: { authorization: 'Bearer example' },
    };
    expect(guard.canActivate(contextFor(undefined, request))).toBe(true);
    expect(() =>
      guard.canActivate(contextFor(undefined, { ...request, path: '/api/v1/auth/signup' })),
    ).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextFor(undefined, { ...request, method: 'GET' }))).toThrow(
      ForbiddenException,
    );
    expect(() =>
      guard.canActivate(
        contextFor(undefined, {
          ...request,
          headers: { authorization: 'Bearer ' },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('does not allow the bearer exception when an access cookie is present', () => {
    const request = {
      method: 'POST',
      path: '/api/v1/auth/logout',
      headers: {
        authorization: 'Bearer example',
        cookie: 'access_token=example',
      },
    };
    expect(() => guard.canActivate(contextFor(undefined, request))).toThrow(ForbiddenException);
    expect(() =>
      guard.canActivate(
        contextFor(undefined, {
          ...request,
          headers: { authorization: 'Bearer example' },
          cookies: { access_token: 'example' },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('rejects untrusted Origin even for bearer-only logout', () => {
    const request = {
      method: 'POST',
      path: '/api/v1/auth/logout',
      headers: { origin: 'https://evil.test', authorization: 'Bearer example' },
    };
    expect(() => guard.canActivate(contextFor(undefined, request))).toThrow(ForbiddenException);
  });

  it('fails closed for bearer-only logout if frontend configuration is missing', () => {
    delete process.env.FRONTEND_URL;
    const request = {
      method: 'POST',
      path: '/api/v1/auth/logout',
      headers: { authorization: 'Bearer example' },
    };
    expect(() => guard.canActivate(contextFor(undefined, request))).toThrow(ForbiddenException);
  });
});
