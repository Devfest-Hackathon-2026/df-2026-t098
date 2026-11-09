import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { TapOriginGuard } from './tap-origin.guard';

describe('TapOriginGuard', () => {
  const guard = new TapOriginGuard();
  const previous = process.env.FRONTEND_URL;
  beforeEach(() => { process.env.FRONTEND_URL = 'https://learn.example.test'; });
  afterAll(() => {
    if (previous === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = previous;
  });
  const context = (headers: Record<string, string | undefined>) => ({
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  }) as unknown as ExecutionContext;

  it('allows public grading from a guest native client', () => {
    expect(guard.canActivate(context({}))).toBe(true);
  });
  it.each([
    { cookie: 'access_token=ambient' },
    { origin: 'https://untrusted.example' },
    { origin: 'null' },
    { 'sec-fetch-site': 'cross-site' },
    { authorization: 'Bearer unverified' },
  ])('never lets the guest exception authorize a browser or unverified session', headers => {
    expect(() => guard.canActivate(context(headers))).toThrow(ForbiddenException);
  });
});
