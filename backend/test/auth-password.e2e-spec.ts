import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { inspect } from 'node:util';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import axios from 'axios';
import { DataSource, QueryFailedError } from 'typeorm';
import { AuthModule } from '../src/auth/auth.module';
import { AuthService } from '../src/auth/auth.service';
import { UserEntity } from '../src/entities/user.entity';
import { UsersService } from '../src/users/users.service';
import { SessionEntity } from '../src/auth/sessions/session.entity';
import { Migrations1793888259896 } from '../migrations/1793888259896-Migrations';
import { PasswordAuthSessions1793930000000 } from '../migrations/1793930000000-PasswordAuthSessions';

const databaseUrl = process.env.TEST_DATABASE_URL;
const origin = 'http://localhost:4200';

if (databaseUrl) {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('TEST_DATABASE_URL must identify a disposable local test database');
  }
  const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]';
  if (!local || !/^\/whylint_auth_e2e_[a-z0-9_]+$/.test(url.pathname)) {
    throw new Error('TEST_DATABASE_URL must point to a local whylint_auth_e2e_* database');
  }
}

const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('Password and Google sessions (HTTP + PostgreSQL)', () => {
  const oldEnvironment = {
    JWT_SECRET: process.env.JWT_SECRET,
    FRONTEND_URL: process.env.FRONTEND_URL,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  };
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
  const email = `learner-${suffix}@example.test`;
  const username = `learner_${suffix}`;
  const password = 'correct horse battery staple';
  let app: INestApplication | undefined;
  let database: DataSource;
  let signupCookie = '';
  let googleCookie = '';
  let googleClaims: { sub: string; email: string; email_verified: boolean; picture?: string; name?: string } = { sub: `google-subject-${suffix}`, email: `google-${suffix}@example.test`, email_verified: true };

  function server() {
    if (!app) throw new Error('Test application was not initialized');
    return app.getHttpServer();
  }

  function cookieFrom(response: request.Response): string {
    const values: unknown = response.headers['set-cookie'];
    if (!Array.isArray(values)) throw new Error('Expected the authentication cookie');
    const cookie = values.find((value): value is string =>
      typeof value === 'string' && value.startsWith('access_token='),
    );
    if (!cookie) throw new Error('Expected the authentication cookie');
    expect(/;\s*HttpOnly/i.test(cookie)).toBe(true);
    expect(/;\s*Secure/i.test(cookie)).toBe(true);
    expect(/;\s*SameSite=Lax/i.test(cookie)).toBe(true);
    expect(/;\s*Path=\//i.test(cookie)).toBe(true);
    return cookie.split(';', 1)[0];
  }

  function bearerFrom(cookie: string): string {
    return cookie.slice('access_token='.length);
  }

  function expectNoCredentials(body: unknown): void {
    const json = JSON.stringify(body);
    expect(json.includes(password)).toBe(false);
    expect(json.includes('password_hash')).toBe(false);
    expect(json.includes('access_token')).toBe(false);
    expect(json.includes('token')).toBe(false);
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-only-jwt-secret-that-is-long-enough';
    process.env.FRONTEND_URL = origin;
    process.env.GOOGLE_CLIENT_ID = 'fixture-client';
    process.env.GOOGLE_CLIENT_SECRET = 'fixture-secret';

    const setup = new DataSource({ type: 'postgres', url: databaseUrl, entities: [], synchronize: false, logging: false });
    await setup.initialize();
    try {
      const tables: { count: number }[] = await setup.query(
        "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
      );
      if (tables[0].count !== 0) throw new Error('The disposable authentication test database must be empty');
    } finally {
      await setup.destroy();
    }

    const migrationDb = new DataSource({
      type: 'postgres',
      url: databaseUrl,
      entities: [UserEntity, SessionEntity],
      migrations: [Migrations1793888259896, PasswordAuthSessions1793930000000],
      synchronize: false,
      logging: false,
    });
    await migrationDb.initialize();
    try {
      await migrationDb.runMigrations({ transaction: 'all' });
    } finally {
      await migrationDb.destroy();
    }

    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres', url: databaseUrl, entities: [UserEntity, SessionEntity], synchronize: false, logging: false,
        }),
        AuthModule,
      ],
    }).compile();
    app = module.createNestApplication();
    app.useLogger(false);
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    await app.init();
    database = app.get(DataSource);

    jest.spyOn(axios, 'post').mockResolvedValue({ data: { id_token: 'fixture-id-token' } });
    const service = app.get(AuthService) as unknown as {
      googleClient: { verifyIdToken: (options: unknown) => Promise<unknown> };
    };
    jest.spyOn(service.googleClient, 'verifyIdToken').mockImplementation(async () => ({
      getPayload: () => googleClaims,
    }));
  }, 30000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await app?.close();
    for (const [key, value] of Object.entries(oldEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('signs up, sets a protected cookie, and returns a safe profile', async () => {
    const signup = await request(server()).post('/api/v1/auth/signup').set('Origin', origin)
      .send({ email, username, password }).expect(201);
    signupCookie = cookieFrom(signup);
    expect(signup.headers['cache-control']).toContain('no-store');
    expectNoCredentials(signup.body);

    const me = await request(server()).get('/api/v1/auth/me').set('Cookie', signupCookie).expect(200);
    expect(me.body.email).toBe(email);
    expect(typeof me.body.id).toBe('string');
    expect(me.headers['cache-control']).toContain('no-store');
    expectNoCredentials(me.body);
    const row = await database.getRepository(UserEntity).findOne({ where: { id: me.body.id as string } });
    expect(row?.password_hash).toBeUndefined();
  });

  it('rejects normalized duplicate email and username without returning credentials', async () => {
    const duplicateEmail = await request(server()).post('/api/v1/auth/signup').set('Origin', origin)
      .send({ email: email.toUpperCase(), username: `other_${suffix}`, password }).expect(409);
    const duplicateUsername = await request(server()).post('/api/v1/auth/signup').set('Origin', origin)
      .send({ email: `other-${suffix}@example.test`, username: username.toUpperCase(), password }).expect(409);
    expectNoCredentials(duplicateEmail.body);
    expectNoCredentials(duplicateUsername.body);
  });

  it.each(['email', 'username'])('logs in case-insensitively by %s', async (method) => {
    const identifier = method === 'email' ? email.toUpperCase() : username.toUpperCase();
    const login = await request(server()).post('/api/v1/auth/password/login').set('Origin', origin)
      .send({ identifier, password }).expect(200);
    const cookie = cookieFrom(login);
    expectNoCredentials(login.body);
    const me = await request(server()).get('/api/v1/auth/me').set('Cookie', cookie).expect(200);
    expect(me.body.email).toBe(email);
  });

  it('preserves Google login and refuses to silently link an existing password email', async () => {
    const login = await request(server()).post('/api/v1/auth/login').set('Origin', origin)
      .send({ code: 'fixture-code' }).expect(201);
    googleCookie = cookieFrom(login);
    expectNoCredentials(login.body);
    const me = await request(server()).get('/api/v1/auth/me').set('Cookie', googleCookie).expect(200);
    expect(me.body.email).toBe(googleClaims.email);

    googleClaims = { sub: `different-google-subject-${suffix}`, email, email_verified: true };
    await request(server()).post('/api/v1/auth/login').set('Origin', origin)
      .send({ code: 'fixture-code-2' }).expect(401);
    googleClaims = { sub: `google-subject-${suffix}`, email: `google-${suffix}@example.test`, email_verified: true };
  });

  it('backfills an existing NULL Google avatar and preserves it when a later claim omits the picture', async () => {
    const original = await database.getRepository(UserEntity).findOneByOrFail({ google_id: googleClaims.sub });
    expect(original.avatar_url).toBeNull();
    googleClaims.picture = 'https://example.test/updated-avatar.png';
    const login = await request(server()).post('/api/v1/auth/login').set('Origin', origin)
      .send({ code: 'fixture-avatar-refresh' }).expect(201);
    const me = await request(server()).get('/api/v1/auth/me').set('Cookie', cookieFrom(login)).expect(200);
    expect(me.body.avatarUrl).toBe(googleClaims.picture);
    const stored = await database.getRepository(UserEntity).findOneByOrFail({ id: original.id });
    expect(stored.avatar_url).toBe(googleClaims.picture);
    expect(stored.email).toBe(original.email);
    delete googleClaims.picture;
    const again = await request(server()).post('/api/v1/auth/login').set('Origin', origin)
      .send({ code: 'fixture-without-picture' }).expect(201);
    const preserved = await request(server()).get('/api/v1/auth/me').set('Cookie', cookieFrom(again)).expect(200);
    expect(preserved.body.avatarUrl).toBe('https://example.test/updated-avatar.png');
  });

  it('sets only the current Google user username with validation, origin and unique-name protection', async () => {
    const endpoint = '/api/v1/auth/me/username';
    await request(server()).patch(endpoint).set('Origin', origin).send({ username: 'some-name' }).expect(401);
    await request(server()).patch(endpoint).set('Cookie', googleCookie).set('Origin', 'https://untrusted.example')
      .send({ username: 'some-name' }).expect(403);
    await request(server()).patch(endpoint).set('Cookie', googleCookie).set('Origin', origin).type('form')
      .send({ username: 'some-name' }).expect(415);
    for (const body of [{ username: 'ab' }, { username: 'some-name', id: randomUUID() }]) {
      await request(server()).patch(endpoint).set('Cookie', googleCookie).set('Origin', origin).send(body).expect(400);
    }
    await request(server()).patch(endpoint).set('Cookie', googleCookie).set('Origin', origin)
      .send({ username: username.toUpperCase() }).expect(409);
    const chosen = `学習_${suffix}`;
    const saved = await request(server()).patch(endpoint).set('Cookie', googleCookie).set('Origin', origin)
      .send({ username: `  ${chosen}  ` }).expect(200);
    expect(saved.body.username).toBe(chosen);
    expect(saved.body.email).toBe(googleClaims.email);
    expect(saved.headers['cache-control']).toContain('no-store');
    expectNoCredentials(saved.body);
    await request(server()).patch(endpoint).set('Cookie', googleCookie).set('Origin', origin)
      .send({ username: chosen.toUpperCase() }).expect(200);
    await request(server()).patch(endpoint).set('Cookie', googleCookie).set('Origin', origin)
      .send({ username: 'replacement-name' }).expect(409);
    const passwordUser = await request(server()).get('/api/v1/auth/me').set('Cookie', signupCookie).expect(200);
    expect(passwordUser.body.username).toBe(username);
  });

  it('backfills and refreshes a Google display name while preserving the chosen username', async () => {
    const repository = database.getRepository(UserEntity);
    const original = await repository.findOneByOrFail({ google_id: googleClaims.sub });
    expect(original.name).toBeNull();
    expect(original.username).not.toBeNull();
    const profile = jest.spyOn(axios, 'get').mockRejectedValue(new Error('Unexpected profile request'));
    profile.mockResolvedValueOnce({ data: { sub: googleClaims.sub, name: 'Fixture Display Name' } });
    (axios.post as jest.Mock).mockResolvedValueOnce({ data: { id_token: 'fixture-id-token', access_token: 'fixture-access-token' } });
    try {
      const login = await request(server()).post('/api/v1/auth/login').set('Origin', origin)
        .send({ code: 'fixture-name-backfill' }).expect(201);
      const me = await request(server()).get('/api/v1/auth/me').set('Cookie', cookieFrom(login)).expect(200);
      expect(me.body.name).toBe('Fixture Display Name');
      expect(me.body.username).toBe(original.username);
      const stored = await repository.findOneByOrFail({ id: original.id });
      expect(stored.name).toBe('Fixture Display Name');
      expect(stored.username).toBe(original.username);
      expect(stored.avatar_url).toBe(original.avatar_url);
      await request(server()).post('/api/v1/auth/login').set('Origin', origin)
        .send({ code: 'fixture-name-omitted' }).expect(201);
      expect((await repository.findOneByOrFail({ id: original.id })).name).toBe('Fixture Display Name');
      googleClaims.name = 'Updated Fixture Name';
      await request(server()).post('/api/v1/auth/login').set('Origin', origin)
        .send({ code: 'fixture-name-refresh' }).expect(201);
      const updated = await repository.findOneByOrFail({ id: original.id });
      expect(updated.name).toBe('Updated Fixture Name');
      expect(updated.username).toBe(original.username);
    } finally {
      delete googleClaims.name;
      profile.mockRestore();
    }
  });

  it('lets exactly one concurrent user claim a case-insensitively unique username', async () => {
    const repository = database.getRepository(UserEntity);
    const users = await repository.save([
      repository.create({ google_id: `race-a-${suffix}`, email: `race-a-${suffix}@example.test` }),
      repository.create({ google_id: `race-b-${suffix}`, email: `race-b-${suffix}@example.test` }),
    ]);
    const name = `race_${suffix}`;
    const results = await Promise.allSettled([
      app!.get(UsersService).setUsername(users[0].id, name),
      app!.get(UsersService).setUsername(users[1].id, name.toUpperCase()),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason.status).toBe(409);
    const stored = await repository.findBy([{ id: users[0].id }, { id: users[1].id }]);
    expect(stored.filter((user) => user.username !== null)).toHaveLength(1);
  });

  it('rejects untrusted Google login origins and forms before contacting Google', async () => {
    const callsBefore = (axios.post as jest.Mock).mock.calls.length;
    await request(server()).post('/api/v1/auth/login').send({ code: 'fixture-code' }).expect(403);
    await request(server()).post('/api/v1/auth/login').set('Origin', 'https://untrusted.example')
      .send({ code: 'fixture-code' }).expect(403);
    await request(server()).post('/api/v1/auth/login').set('Origin', 'https://untrusted.example').type('form')
      .send({ code: 'fixture-code' }).expect(403);
    await request(server()).post('/api/v1/auth/login').set('Origin', origin).type('form')
      .send({ code: 'fixture-code' }).expect(415);
    expect((axios.post as jest.Mock).mock.calls.length === callsBefore).toBe(true);
  });

  it('uses the same generic error for wrong, missing, and Google-only accounts', async () => {
    const login = (identifier: string, attempt: string) => request(server())
      .post('/api/v1/auth/password/login').set('Origin', origin).send({ identifier, password: attempt });
    const wrong = await login(email, 'incorrect password').expect(401);
    const absent = await login(`missing-${suffix}@example.test`, 'incorrect password').expect(401);
    const googleOnly = await login(googleClaims.email, 'incorrect password').expect(401);
    expect(wrong.body.message).toBe('Invalid credentials');
    expect(absent.body.message).toBe(wrong.body.message);
    expect(googleOnly.body.message).toBe(wrong.body.message);
  });

  it('rejects a valid JWT when its database session has expired, and rejects legacy tokens', async () => {
    const login = await request(server()).post('/api/v1/auth/password/login').set('Origin', origin)
      .send({ identifier: username, password }).expect(200);
    const cookie = cookieFrom(login);
    const claims = await app!.get(JwtService).verifyAsync<{ sid: string }>(bearerFrom(cookie));
    await database.getRepository(SessionEntity).update({ id: claims.sid }, { expires_at: new Date(Date.now() - 1000) });
    await request(server()).get('/api/v1/auth/me').set('Cookie', cookie).expect(401);

    const legacy = await app!.get(JwtService).signAsync({ sub: randomUUID() }, { expiresIn: '7d' });
    await request(server()).get('/api/v1/auth/me').set('Authorization', `Bearer ${legacy}`).expect(401);
  });

  it('rejects bad input, non-JSON requests, and missing or untrusted origins', async () => {
    await request(server()).post('/api/v1/auth/signup').set('Origin', origin).send({ email, username, password: 'short' }).expect(400);
    await request(server()).post('/api/v1/auth/signup').set('Origin', origin).type('form')
      .send({ email: `form-${suffix}@example.test`, username: `form_${suffix}`, password }).expect(415);
    await request(server()).post('/api/v1/auth/signup').send({ email, username, password }).expect(403);
    await request(server()).post('/api/v1/auth/password/login').set('Origin', 'https://untrusted.example')
      .send({ identifier: email, password }).expect(403);
    await request(server()).post('/api/v1/auth/logout').set('Cookie', signupCookie).expect(403);
  });

  it('clears the cookie and revokes the current session for cookie and bearer use', async () => {
    const token = bearerFrom(signupCookie);
    await request(server()).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
    const logout = await request(server()).post('/api/v1/auth/logout').set('Origin', origin).set('Cookie', signupCookie).expect(204);
    const cleared: unknown = logout.headers['set-cookie'];
    expect(Array.isArray(cleared) && cleared.some((value: unknown) => typeof value === 'string' && /^access_token=;/.test(value))).toBe(true);
    await request(server()).get('/api/v1/auth/me').set('Cookie', signupCookie).expect(401);
    await request(server()).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
  });

  it('allows originless bearer-only logout and revokes the Google session', async () => {
    const token = bearerFrom(googleCookie);
    await request(server()).post('/api/v1/auth/logout').set('Authorization', `Bearer ${token}`).expect(204);
    await request(server()).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
  });

  it('clears cookies idempotently for missing, invalid, and expired tokens', async () => {
    const expired = await app!.get(JwtService).signAsync({ sub: randomUUID(), sid: randomUUID() }, { expiresIn: -1 });
    for (const cookie of [undefined, 'access_token=not-a-jwt', `access_token=${expired}`]) {
      const logout = request(server()).post('/api/v1/auth/logout').set('Origin', origin);
      if (cookie) logout.set('Cookie', cookie);
      const result = await logout.expect(204);
      const cleared: unknown = result.headers['set-cookie'];
      expect(Array.isArray(cleared) && cleared.some((value: unknown) => typeof value === 'string' && /^access_token=;/.test(value))).toBe(true);
    }
  });

  it('sanitizes a database failure during signup in the HTTP response and emitted logs', async () => {
    const sentinel = 'fixture-password-hash-redaction-sentinel';
    const failure = new QueryFailedError(
      `INSERT INTO fixture VALUES ('${sentinel}')`,
      [sentinel],
      new Error(`fixture driver failure: ${sentinel}`),
    );
    const signup = jest.spyOn(app!.get(AuthService), 'signup').mockRejectedValueOnce(failure);
    const logs: string[] = [];
    const capture = (...values: unknown[]) => {
      logs.push(values.map((value) => typeof value === 'string' ? value : inspect(value, { depth: 6, showHidden: true })).join(' '));
    };
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => { capture(chunk); return true; });
    const stderr = jest.spyOn(process.stderr, 'write').mockImplementation((chunk) => { capture(chunk); return true; });
    const consoleLog = jest.spyOn(console, 'log').mockImplementation(capture);
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(capture);
    const consoleError = jest.spyOn(console, 'error').mockImplementation(capture);
    app!.useLogger({ log: capture, warn: capture, error: capture });

    try {
      const response = await request(server()).post('/api/v1/auth/signup').set('Origin', origin)
        .send({ email: `filter-${suffix}@example.test`, username: `filter_${suffix}`, password }).expect(503);
      expect(response.body.statusCode).toBe(503);
      expect(response.body.message === 'Database temporarily unavailable').toBe(true);
      expect(JSON.stringify(response.body).includes(sentinel)).toBe(false);
      expect(logs.some((line) => line.includes('Database operation failed'))).toBe(true);
      expect(logs.some((line) => line.includes(sentinel))).toBe(false);
    } finally {
      app!.useLogger(false);
      signup.mockRestore();
      stdout.mockRestore();
      stderr.mockRestore();
      consoleLog.mockRestore();
      consoleWarn.mockRestore();
      consoleError.mockRestore();
    }
  });

  it('rolls back user creation if session creation fails', async () => {
    const rollbackEmail = `rollback-${suffix}@example.test`;
    const trigger = `test_reject_session_${suffix}`;
    await database.query(`CREATE FUNCTION "${trigger}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test session failure'; END $$`);
    await database.query(`CREATE TRIGGER "${trigger}" BEFORE INSERT ON "sessions" FOR EACH ROW EXECUTE FUNCTION "${trigger}"()`);
    try {
      await request(server()).post('/api/v1/auth/signup').set('Origin', origin)
        .send({ email: rollbackEmail, username: `rollback_${suffix}`, password }).expect(503);
      const user = await database.getRepository(UserEntity).findOne({ where: { email: rollbackEmail } });
      expect(user).toBeNull();
    } finally {
      await database.query(`DROP TRIGGER "${trigger}" ON "sessions"`);
      await database.query(`DROP FUNCTION "${trigger}"()`);
    }
  });

  it('rate limits repeated password attempts', async () => {
    let rateLimited = false;
    for (let attempt = 0; attempt < 12; attempt++) {
      const result = await request(server()).post('/api/v1/auth/password/login').set('Origin', origin)
        .send({ identifier: `unknown-${suffix}@example.test`, password: 'incorrect password' });
      if (result.status === 429) { rateLimited = true; break; }
    }
    expect(rateLimited).toBe(true);
  }, 30000);
});
