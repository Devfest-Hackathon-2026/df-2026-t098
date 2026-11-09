import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { MobileClientGuard } from './mobile-client.guard';

describe('MobileClientGuard', () => {
  const guard = new MobileClientGuard();
  const context = (headers: Record<string, string | undefined>, cookies = {}) => ({
    switchToHttp: () => ({ getRequest: () => ({ headers, cookies }) }),
  }) as unknown as ExecutionContext;

  it('accepts a direct client with no ambient browser credentials', () => {
    expect(guard.canActivate(context({}))).toBe(true);
  });

  it.each([
    { origin: 'http://localhost:4200' },
    { origin: 'null' },
    { cookie: 'access_token=ambient' },
    { 'sec-fetch-site': 'same-origin' },
  ])('rejects a browser request to the token-delivery endpoints', (headers) => {
    expect(() => guard.canActivate(context(headers))).toThrow(ForbiddenException);
  });

  it('also rejects parsed cookies', () => {
    expect(() => guard.canActivate(context({}, { access_token: 'ambient' }))).toThrow(ForbiddenException);
  });
});
