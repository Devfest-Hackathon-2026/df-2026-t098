import { BadGatewayException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import * as argon2 from 'argon2';
import axios from 'axios';
import type { DataSource, EntityManager } from 'typeorm';
import type { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import type { AccountEmailService } from './account-email.service';
import type { SessionsService } from './sessions/sessions.service';

describe('AuthService', () => {
  const userId = '00000000-0000-4000-8000-000000000001';
  const sessionId = '00000000-0000-4000-8000-000000000002';
  const password = '  demo password for tests  ';
  const jwtService = new JwtService({
    secret: 'test-only-signing-secret',
    signOptions: { expiresIn: '7d', algorithm: 'HS256' },
  });
  const users = {
    createPasswordUser: jest.fn(),
    findByIdentifier: jest.fn(),
    findByGoogleId: jest.fn(),
    createUser: jest.fn(),
    findById: jest.fn(),
    updateGoogleAvatar: jest.fn(),
    updateGoogleName: jest.fn(),
  };
  const sessions = { create: jest.fn(), revoke: jest.fn(), revokeAll: jest.fn() };
  const transactionManager = {
    marker: 'transaction-manager',
  } as unknown as EntityManager;
  const dataSource = {
    query: jest.fn(),
    transaction: jest.fn(async (callback: (manager: EntityManager) => Promise<unknown>) =>
      callback(transactionManager),
    ),
  };
  const originalEnv = {
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    FRONTEND_URL: process.env.FRONTEND_URL,
  };
  let service: AuthService;
  let passwordHash: string;
  let exchange: jest.SpiedFunction<typeof axios.post>;
  let verifyGoogle: jest.SpiedFunction<OAuth2Client['verifyIdToken']>;

  beforeAll(async () => {
    service = new AuthService(
      jwtService,
      users as unknown as UsersService,
      sessions as unknown as SessionsService,
      dataSource as unknown as DataSource,
      { sendVerificationQuietly: jest.fn() } as unknown as AccountEmailService,
    );
    await service.onModuleInit();
    passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
    process.env.FRONTEND_URL = 'http://localhost:4200';
    sessions.create.mockResolvedValue({ id: sessionId });
    sessions.revoke.mockResolvedValue(undefined);
    users.updateGoogleAvatar.mockResolvedValue(undefined);
    users.updateGoogleName.mockResolvedValue(undefined);
    jest.spyOn(axios, 'get').mockRejectedValue(new Error('Unexpected profile request'));
    exchange = jest.spyOn(axios, 'post').mockRejectedValue(new Error('Unexpected network request'));
    verifyGoogle = jest.spyOn(OAuth2Client.prototype, 'verifyIdToken');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  async function expectIssuedSession(
    result: { message: string; token: string },
    message: string,
    manager?: EntityManager,
  ) {
    expect(result.message).toBe(message);
    if (manager) expect(sessions.create).toHaveBeenCalledWith(userId, manager);
    else expect(sessions.create).toHaveBeenCalledWith(userId);
    const claims = await jwtService.verifyAsync(result.token);
    expect(claims).toEqual(
      expect.objectContaining({
        sub: userId,
        sid: sessionId,
        exp: expect.any(Number),
      }),
    );
    expect(claims).not.toHaveProperty('password');
    expect(claims).not.toHaveProperty('password_hash');
  }

  function mockGoogleIdentity(
    picture: string | null = 'https://example.test/avatar.png',
    name: string | null = 'Learner',
  ) {
    exchange.mockResolvedValueOnce({
      data: { id_token: 'test-id-token', access_token: 'test-only-google-access-token' },
    });
    verifyGoogle.mockResolvedValueOnce({
      getPayload: () => ({
        sub: 'google-subject',
        email: 'learner@example.test',
        email_verified: true,
        name: name ?? undefined,
        picture: picture ?? undefined,
      }),
    } as never);
  }

  it('hashes a signup password without changing it and creates a session', async () => {
    users.createPasswordUser.mockResolvedValue({ id: userId });
    const result = await service.signup({
      email: 'learner@example.test',
      username: 'learner',
      password,
    });

    expect(users.createPasswordUser).toHaveBeenCalledWith(
      { email: 'learner@example.test', username: 'learner' },
      expect.any(String),
      transactionManager,
    );
    const storedHash = users.createPasswordUser.mock.calls[0][1] as string;
    expect(storedHash).toMatch(/^\$argon2id\$/);
    expect(storedHash).not.toContain(password);
    expect(await argon2.verify(storedHash, password)).toBe(true);
    expect(await argon2.verify(storedHash, password.trim())).toBe(false);
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    await expectIssuedSession(result, 'Account created!', transactionManager);
  });

  it('propagates a session creation failure from the signup transaction', async () => {
    users.createPasswordUser.mockResolvedValue({ id: userId });
    const databaseError = new Error('session transaction failed');
    sessions.create.mockRejectedValueOnce(databaseError);
    const sign = jest.spyOn(jwtService, 'signAsync');

    await expect(
      service.signup({
        email: 'learner@example.test',
        username: 'learner',
        password,
      }),
    ).rejects.toBe(databaseError);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(sessions.create).toHaveBeenCalledWith(userId, transactionManager);
    expect(sign).not.toHaveBeenCalled();
  });

  it('keeps token signing inside the signup transaction and propagates a signing failure', async () => {
    users.createPasswordUser.mockResolvedValue({ id: userId });
    let transactionActive = false;
    dataSource.transaction.mockImplementationOnce(async (callback) => {
      transactionActive = true;
      try {
        return await callback(transactionManager);
      } finally {
        transactionActive = false;
      }
    });
    const signingError = new Error('test signing failed');
    const sign = jest.spyOn(jwtService, 'signAsync').mockImplementationOnce(async () => {
      expect(transactionActive).toBe(true);
      throw signingError;
    });

    await expect(
      service.signup({
        email: 'learner@example.test',
        username: 'learner',
        password,
      }),
    ).rejects.toBe(signingError);

    expect(sign).toHaveBeenCalledTimes(1);
    expect(transactionActive).toBe(false);
  });

  it.each(['learner', 'learner@example.test'])(
    'authenticates %s with its password and creates a session',
    async (identifier) => {
      users.findByIdentifier.mockResolvedValue({
        id: userId,
        password_hash: passwordHash,
      });

      const result = await service.passwordLogin({ identifier, password });

      expect(users.findByIdentifier).toHaveBeenCalledWith(identifier);
      await expectIssuedSession(result, 'Login successful!');
    },
  );

  it.each([
    { label: 'missing account', user: null, attempted: password },
    {
      label: 'Google-only account',
      user: { id: userId, password_hash: null },
      attempted: password,
    },
    {
      label: 'wrong password',
      user: { id: userId, password_hash: 'REAL_HASH' },
      attempted: 'wrong password',
    },
  ])('returns the same unauthorized error for $label', async ({ user, attempted }) => {
    const resolvedUser =
      user?.password_hash === 'REAL_HASH' ? { ...user, password_hash: passwordHash } : user;
    users.findByIdentifier.mockResolvedValue(resolvedUser);

    await expect(
      service.passwordLogin({ identifier: 'learner', password: attempted }),
    ).rejects.toMatchObject({
      status: 401,
      message: 'Invalid credentials',
    });
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it('returns a sanitized current-user profile', async () => {
    users.findById.mockResolvedValue({
      id: userId,
      email: 'learner@example.test',
      name: null,
      avatar_url: null,
      google_id: 'google-subject',
      password_hash: 'private-test-hash',
    });
    await expect(service.getCurrentUser(userId)).resolves.toEqual({
      id: userId,
      email: 'learner@example.test',
      name: null,
      avatarUrl: null,
      username: null,
      emailVerified: false,
    });
    users.findById.mockResolvedValue(null);
    await expect(service.getCurrentUser(userId)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('revokes the session for a valid signed token', async () => {
    const token = await jwtService.signAsync({ sub: userId, sid: sessionId });
    await service.logout(token);
    expect(sessions.revoke).toHaveBeenCalledWith(sessionId, userId);
  });

  it('does not revoke anything for missing, invalid, expired or legacy tokens', async () => {
    const expired = await jwtService.signAsync({ sub: userId, sid: sessionId }, { expiresIn: -1 });
    const legacy = await jwtService.signAsync({ sub: userId });
    const otherJwt = new JwtService({
      secret: 'different-test-secret',
      signOptions: { expiresIn: '7d' },
    });
    const wrongSignature = await otherJwt.signAsync({
      sub: userId,
      sid: sessionId,
    });

    for (const token of [undefined, 'invalid.token.value', expired, legacy, wrongSignature]) {
      await expect(service.logout(token)).resolves.toBeUndefined();
    }
    expect(sessions.revoke).not.toHaveBeenCalled();
  });

  it('propagates a database revocation failure', async () => {
    const token = await jwtService.signAsync({ sub: userId, sid: sessionId });
    const databaseError = new Error('database unavailable');
    sessions.revoke.mockRejectedValueOnce(databaseError);

    await expect(service.logout(token)).rejects.toBe(databaseError);
  });

  it('does not sign a token if creating the persisted session fails', async () => {
    users.findByIdentifier.mockResolvedValue({
      id: userId,
      password_hash: passwordHash,
    });
    const databaseError = new Error('session database unavailable');
    sessions.create.mockRejectedValueOnce(databaseError);
    const sign = jest.spyOn(jwtService, 'signAsync');

    await expect(service.passwordLogin({ identifier: 'learner', password })).rejects.toBe(
      databaseError,
    );
    expect(sign).not.toHaveBeenCalled();
  });

  it('signs in an existing Google account by verified subject', async () => {
    mockGoogleIdentity();
    users.findByGoogleId.mockResolvedValueOnce({ id: userId });

    const result = await service.login('test-authorization-code');

    expect(exchange).toHaveBeenCalledTimes(1);
    const [url, body, options] = exchange.mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    expect(body).toBeInstanceOf(URLSearchParams);
    expect((body as URLSearchParams).get('redirect_uri')).toBe(
      'http://localhost:4200/auth/google/callback',
    );
    expect((body as URLSearchParams).get('grant_type')).toBe('authorization_code');
    expect(options?.headers).toEqual(
      expect.objectContaining({
        'Content-Type': 'application/x-www-form-urlencoded',
      }),
    );
    expect(verifyGoogle).toHaveBeenCalledWith({
      idToken: 'test-id-token',
      audience: 'test-client-id',
    });
    expect(users.findByGoogleId).toHaveBeenCalledWith('google-subject');
    expect(users.updateGoogleAvatar).toHaveBeenCalledWith(
      userId,
      'google-subject',
      'https://example.test/avatar.png',
    );
    expect(users.updateGoogleName).toHaveBeenCalledWith(userId, 'google-subject', 'Learner');
    expect(users.createUser).not.toHaveBeenCalled();
    expect(users.findByIdentifier).not.toHaveBeenCalled();
    await expectIssuedSession(result, 'Login successful!');
  });

  it('exchanges a mobile Google identity using the configured server audience', async () => {
    mockGoogleIdentity();
    users.findByGoogleId.mockResolvedValueOnce({ id: userId });
    const result = await service.mobileGoogleLogin('native-id-token');
    expect(verifyGoogle).toHaveBeenCalledWith({ idToken: 'native-id-token', audience: 'test-client-id' });
    expect(exchange).not.toHaveBeenCalled();
    await expectIssuedSession(result, 'Login successful!');
  });

  it('rejects invalid mobile identity tokens without issuing a session', async () => {
    verifyGoogle.mockRejectedValueOnce(new Error('invalid token') as never);
    await expect(service.mobileGoogleLogin('invalid')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it('creates a new Google account using the verified profile', async () => {
    mockGoogleIdentity();
    users.findByGoogleId.mockResolvedValueOnce(null);
    users.createUser.mockResolvedValueOnce({ id: userId });

    const result = await service.login('test-authorization-code');

    expect(users.createUser).toHaveBeenCalledWith({
      email: 'learner@example.test',
      googleId: 'google-subject',
      name: 'Learner',
      picture: 'https://example.test/avatar.png',
    });
    expect(users.findByIdentifier).not.toHaveBeenCalled();
    await expectIssuedSession(result, 'Login successful!');
  });

  it('fills a missing avatar from UserInfo only for the verified Google subject', async () => {
    mockGoogleIdentity(null);
    users.findByGoogleId.mockResolvedValueOnce({ id: userId, avatar_url: null });
    jest
      .mocked(axios.get)
      .mockResolvedValueOnce({
        data: { sub: 'google-subject', picture: 'https://example.test/profile.png' },
      });

    await service.login('test-authorization-code');

    expect(axios.get).toHaveBeenCalledWith('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: 'Bearer test-only-google-access-token' },
      timeout: 3000,
    });
    expect(users.updateGoogleAvatar).toHaveBeenCalledWith(
      userId,
      'google-subject',
      'https://example.test/profile.png',
    );
  });

  it('ignores a UserInfo picture for a different subject and keeps the stored avatar', async () => {
    mockGoogleIdentity(null);
    users.findByGoogleId.mockResolvedValueOnce({
      id: userId,
      avatar_url: 'https://example.test/stored.png',
    });
    jest
      .mocked(axios.get)
      .mockResolvedValueOnce({
        data: { sub: 'another-subject', picture: 'https://example.test/other.png' },
      });

    await expectIssuedSession(await service.login('test-authorization-code'), 'Login successful!');
    expect(users.updateGoogleAvatar).not.toHaveBeenCalled();
  });

  it('keeps the stored avatar and permits login when optional UserInfo is unavailable', async () => {
    mockGoogleIdentity(null);
    users.findByGoogleId.mockResolvedValueOnce({
      id: userId,
      avatar_url: 'https://example.test/stored.png',
    });

    await expectIssuedSession(await service.login('test-authorization-code'), 'Login successful!');
    expect(users.updateGoogleAvatar).not.toHaveBeenCalled();
  });

  it('does not rewrite an unchanged avatar or call UserInfo when the token has a picture', async () => {
    mockGoogleIdentity();
    users.findByGoogleId.mockResolvedValueOnce({
      id: userId,
      avatar_url: 'https://example.test/avatar.png',
    });

    await service.login('test-authorization-code');
    expect(users.updateGoogleAvatar).not.toHaveBeenCalled();
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('does not create a session when persisting the refreshed avatar fails', async () => {
    mockGoogleIdentity();
    users.findByGoogleId.mockResolvedValueOnce({ id: userId, avatar_url: null });
    const failure = new Error('database unavailable');
    users.updateGoogleAvatar.mockRejectedValueOnce(failure);

    await expect(service.login('test-authorization-code')).rejects.toBe(failure);
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it('uses UserInfo for a missing name even when the verified token already has a picture', async () => {
    mockGoogleIdentity('https://example.test/avatar.png', null);
    users.findByGoogleId.mockResolvedValueOnce({
      id: userId,
      name: null,
      avatar_url: 'https://example.test/avatar.png',
    });
    jest
      .mocked(axios.get)
      .mockResolvedValueOnce({
        data: {
          sub: 'google-subject',
          name: '  Fixture Display Name  ',
          picture: 'https://example.test/other.png',
        },
      });
    await service.login('test-authorization-code');
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(users.updateGoogleName).toHaveBeenCalledWith(
      userId,
      'google-subject',
      'Fixture Display Name',
    );
    expect(users.updateGoogleAvatar).not.toHaveBeenCalled();
  });

  it('passes a UserInfo display name into new Google account creation', async () => {
    mockGoogleIdentity(null, null);
    users.findByGoogleId.mockResolvedValueOnce(null);
    users.createUser.mockResolvedValueOnce({
      id: userId,
      name: 'Fixture Display Name',
      avatar_url: 'https://example.test/profile.png',
    });
    jest
      .mocked(axios.get)
      .mockResolvedValueOnce({
        data: {
          sub: 'google-subject',
          name: 'Fixture Display Name',
          picture: 'https://example.test/profile.png',
        },
      });
    await service.login('test-authorization-code');
    expect(users.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Fixture Display Name',
        picture: 'https://example.test/profile.png',
      }),
    );
    expect(users.updateGoogleName).not.toHaveBeenCalled();
  });

  it('ignores a UserInfo name for a different Google subject', async () => {
    mockGoogleIdentity(null, null);
    users.findByGoogleId.mockResolvedValueOnce({ id: userId, name: 'Stored Name' });
    jest
      .mocked(axios.get)
      .mockResolvedValueOnce({ data: { sub: 'another-subject', name: 'Different Name' } });
    await expectIssuedSession(await service.login('test-authorization-code'), 'Login successful!');
    expect(users.updateGoogleName).not.toHaveBeenCalled();
    expect(users.updateGoogleAvatar).not.toHaveBeenCalled();
  });

  it.each(['unavailable', 'empty'])(
    'preserves a stored name when optional profile data is %s',
    async (outcome) => {
      mockGoogleIdentity('https://example.test/avatar.png', null);
      users.findByGoogleId.mockResolvedValueOnce({
        id: userId,
        name: 'Stored Name',
        avatar_url: 'https://example.test/avatar.png',
      });
      if (outcome === 'empty')
        jest
          .mocked(axios.get)
          .mockResolvedValueOnce({ data: { sub: 'google-subject', name: '   ' } });
      await expectIssuedSession(
        await service.login('test-authorization-code'),
        'Login successful!',
      );
      expect(users.updateGoogleName).not.toHaveBeenCalled();
    },
  );

  it('does not rewrite an unchanged verified display name', async () => {
    mockGoogleIdentity();
    users.findByGoogleId.mockResolvedValueOnce({
      id: userId,
      name: 'Learner',
      avatar_url: 'https://example.test/avatar.png',
    });
    await service.login('test-authorization-code');
    expect(users.updateGoogleName).not.toHaveBeenCalled();
  });

  it('does not issue a session if persisting a refreshed display name fails', async () => {
    mockGoogleIdentity();
    users.findByGoogleId.mockResolvedValueOnce({ id: userId, name: null });
    const failure = new Error('database unavailable');
    users.updateGoogleName.mockRejectedValueOnce(failure);
    await expect(service.login('test-authorization-code')).rejects.toBe(failure);
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it('handles a concurrent Google creation only by rechecking the verified subject', async () => {
    mockGoogleIdentity();
    users.findByGoogleId.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: userId });
    users.createUser.mockRejectedValueOnce(new ConflictException('duplicate'));

    const result = await service.login('test-authorization-code');

    expect(users.findByGoogleId).toHaveBeenCalledTimes(2);
    expect(users.findByGoogleId).toHaveBeenNthCalledWith(2, 'google-subject');
    expect(users.findByIdentifier).not.toHaveBeenCalled();
    await expectIssuedSession(result, 'Login successful!');
  });

  it('rejects an email collision rather than linking another identity', async () => {
    mockGoogleIdentity();
    users.findByGoogleId.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    users.createUser.mockRejectedValueOnce(new ConflictException('duplicate'));

    await expect(service.login('test-authorization-code')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(users.findByGoogleId).toHaveBeenCalledTimes(2);
    expect(users.findByIdentifier).not.toHaveBeenCalled();
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it('returns sanitized failures for invalid Google codes and upstream failures', async () => {
    exchange.mockReset();
    exchange.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 400 },
      message: 'private-test-data',
    });
    await expect(service.login('test-authorization-code')).rejects.toMatchObject({
      status: 401,
      message: 'Unable to sign in with Google',
    });

    exchange.mockRejectedValueOnce(new Error('private-test-data'));
    await expect(service.login('test-authorization-code')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(verifyGoogle).not.toHaveBeenCalled();
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it('treats Google certificate-fetch failures as an upstream error without leaking details', async () => {
    exchange.mockResolvedValueOnce({ data: { id_token: 'test-id-token' } });
    verifyGoogle.mockRejectedValueOnce(
      new Error('Failed to retrieve verification certificates: sensitive-fixture') as never,
    );

    await expect(service.login('test-authorization-code')).rejects.toMatchObject({
      status: 502,
      message: 'Google sign-in is unavailable',
    });
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it('rejects an unverified Google email before creating a user or session', async () => {
    exchange.mockResolvedValueOnce({ data: { id_token: 'test-id-token' } });
    verifyGoogle.mockResolvedValueOnce({
      getPayload: () => ({
        sub: 'google-subject',
        email: 'a@example.test',
        email_verified: false,
      }),
    } as never);
    await expect(service.login('test-authorization-code')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(users.findByGoogleId).not.toHaveBeenCalled();
    expect(sessions.create).not.toHaveBeenCalled();
  });
  describe('deleteAccount', () => {
    const query = jest.fn();
    beforeEach(() => {
      query.mockReset();
      (transactionManager as unknown as { query: jest.Mock }).query = query;
      sessions.revokeAll.mockResolvedValue(undefined);
    });

    it('locks the user, revokes every session and deletes the user in one transaction', async () => {
      query.mockResolvedValueOnce([{ id: userId }]).mockResolvedValueOnce([]);
      await expect(service.deleteAccount(userId)).resolves.toBeUndefined();

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(query.mock.calls[0][0]).toMatch(/FROM users WHERE id = \$1 FOR UPDATE/);
      expect(sessions.revokeAll).toHaveBeenCalledWith(userId, transactionManager);
      expect(query.mock.calls[1]).toEqual(['DELETE FROM users WHERE id = $1', [userId]]);
      expect(sessions.revokeAll.mock.invocationCallOrder[0]).toBeGreaterThan(
        query.mock.invocationCallOrder[0],
      );
      expect(sessions.revokeAll.mock.invocationCallOrder[0]).toBeLessThan(
        query.mock.invocationCallOrder[1],
      );
    });

    it('does nothing when the account is already gone', async () => {
      query.mockResolvedValueOnce([]);
      await expect(service.deleteAccount(userId)).resolves.toBeUndefined();
      expect(sessions.revokeAll).not.toHaveBeenCalled();
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('propagates a failed deletion so the transaction rolls back', async () => {
      const failure = new Error('database unavailable');
      query.mockResolvedValueOnce([{ id: userId }]).mockRejectedValueOnce(failure);
      await expect(service.deleteAccount(userId)).rejects.toBe(failure);
    });
  });
});
