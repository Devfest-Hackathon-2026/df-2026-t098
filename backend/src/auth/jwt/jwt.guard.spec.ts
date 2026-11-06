import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthenticatedRequest } from './jwt.dto';
import type { SessionsService } from '../sessions/sessions.service';
import { JwtGuard } from './jwt.guard';

describe('JwtGuard', () => {
  const jwtService = new JwtService({ secret: 'test-only-jwt-secret' });
  const userId = '11111111-1111-4111-8111-111111111111';
  const sessionId = '22222222-2222-4222-8222-222222222222';
  const sessions = { isActive: jest.fn() };
  const guard = new JwtGuard(jwtService, sessions as unknown as SessionsService);

  function contextFor(request: Partial<AuthenticatedRequest>): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  async function issueToken(payload: object = { sub: userId, sid: sessionId }): Promise<string> {
    return jwtService.signAsync(payload, { expiresIn: '15m', algorithm: 'HS256' });
  }

  beforeEach(() => {
    sessions.isActive.mockReset();
    sessions.isActive.mockResolvedValue(true);
  });

  it('accepts a valid cookie, checks the matching session and attaches claims', async () => {
    const token = await issueToken();
    const request: Partial<AuthenticatedRequest> = {
      cookies: { access_token: token },
      headers: {},
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(sessions.isActive).toHaveBeenCalledWith(sessionId, userId);
    expect(request.user).toEqual(expect.objectContaining({ sub: userId, sid: sessionId, exp: expect.any(Number) }));
  });

  it('accepts a valid bearer token', async () => {
    const token = await issueToken();
    const request: Partial<AuthenticatedRequest> = { headers: { authorization: `Bearer ${token}` } };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(sessions.isActive).toHaveBeenCalledWith(sessionId, userId);
    expect(request.user?.sub).toBe(userId);
  });

  it('rejects missing, incorrectly signed, and tampered tokens before querying sessions', async () => {
    const valid = await issueToken();
    const [header, payload, signature] = valid.split('.');
    const tampered = `${header}.${payload}.${signature[0] === 'a' ? 'b' : 'a'}${signature.slice(1)}`;
    const otherSigner = new JwtService({ secret: 'another-test-key' });
    const wrongKey = await otherSigner.signAsync({ sub: userId, sid: sessionId }, { expiresIn: '15m' });

    await expect(guard.canActivate(contextFor({ headers: {} }))).rejects.toBeInstanceOf(UnauthorizedException);
    for (const token of [tampered, wrongKey]) {
      await expect(guard.canActivate(contextFor({ headers: {}, cookies: { access_token: token } })))
        .rejects.toBeInstanceOf(UnauthorizedException);
    }
    expect(sessions.isActive).not.toHaveBeenCalled();
  });

  it('rejects expired, legacy, malformed-ID and no-expiry tokens', async () => {
    const expired = await jwtService.signAsync({ sub: userId, sid: sessionId }, { expiresIn: -1 });
    const legacy = await issueToken({ sub: userId });
    const invalidUser = await issueToken({ sub: 'not-a-uuid', sid: sessionId });
    const invalidSession = await issueToken({ sub: userId, sid: 'not-a-uuid' });
    const missingSubject = await issueToken({ sid: sessionId });
    const noExpiry = await jwtService.signAsync({ sub: userId, sid: sessionId });

    for (const token of [expired, legacy, invalidUser, invalidSession, missingSubject, noExpiry]) {
      await expect(guard.canActivate(contextFor({ headers: {}, cookies: { access_token: token } })))
        .rejects.toBeInstanceOf(UnauthorizedException);
    }
    expect(sessions.isActive).not.toHaveBeenCalled();
  });

  it.each(['HS384', 'HS512'] as const)('rejects tokens signed with %s instead of HS256', async (algorithm) => {
    const token = await jwtService.signAsync({ sub: userId, sid: sessionId }, { expiresIn: '15m', algorithm });

    await expect(guard.canActivate(contextFor({ headers: {}, cookies: { access_token: token } })))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(sessions.isActive).not.toHaveBeenCalled();
  });

  it.each(['revoked', 'expired', 'foreign'])('rejects a %s session', async () => {
    sessions.isActive.mockResolvedValue(false);
    const token = await issueToken();

    await expect(guard.canActivate(contextFor({ headers: {}, cookies: { access_token: token } })))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(sessions.isActive).toHaveBeenCalledWith(sessionId, userId);
  });

  it('propagates database errors instead of misreporting them as invalid tokens', async () => {
    const databaseError = new Error('database unavailable');
    sessions.isActive.mockRejectedValue(databaseError);
    const token = await issueToken();

    await expect(guard.canActivate(contextFor({ headers: {}, cookies: { access_token: token } })))
      .rejects.toBe(databaseError);
  });
});
