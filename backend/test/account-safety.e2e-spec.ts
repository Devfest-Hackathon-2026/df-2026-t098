import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { UserEntity } from '../src/entities/user.entity';
import { SessionEntity } from '../src/auth/sessions/session.entity';
import { SessionsService } from '../src/auth/sessions/sessions.service';
import { AuthModule } from '../src/auth/auth.module';
import { LearningModule } from '../src/learning/learning.module';
import { LEARNING_ENTITIES } from '../src/learning/entities/learning.entity';
import { QuestionsService } from '../src/learning/questions.service';
import { GeminiService } from '../src/learning/gemini/gemini.service';
import type { GeneratedQuestion } from '../src/learning/gemini/gemini.types';
import { Migrations1793888259896 } from '../migrations/1793888259896-Migrations';
import { PasswordAuthSessions1793930000000 } from '../migrations/1793930000000-PasswordAuthSessions';
import { LearningEngine1794000000000 } from '../migrations/1794000000000-LearningEngine';
import { TapQuizLearningLoop1794100000000 } from '../migrations/1794100000000-TapQuizLearningLoop';
import { SocialLearningCommunity1794200000000 } from '../migrations/1794200000000-SocialLearningCommunity';
import { QuestionConcepts1794300000000 } from '../migrations/1794300000000-QuestionConcepts';
import { FixIPv4OctetQuestion1794310000000 } from '../migrations/1794310000000-FixIPv4OctetQuestion';
import { AccountSafety1794400000000 } from '../migrations/1794400000000-AccountSafety';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) {
  const parsed = new URL(databaseUrl);
  if (
    !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) ||
    !/^\/whylint_auth_e2e_[a-z0-9_]+$/.test(parsed.pathname)
  ) {
    throw new Error(
      'Account safety tests require a disposable local whylint_auth_e2e_* database',
    );
  }
}

const describeDatabase = databaseUrl ? describe : describe.skip;
describeDatabase('Account deletion, reports and blocks (HTTP and disposable PostgreSQL)', () => {
  const schema = `account_safety_${randomUUID().replaceAll('-', '')}`;
  const origin = 'http://localhost:4200';
  const previous = {
    JWT_SECRET: process.env.JWT_SECRET,
    FRONTEND_URL: process.env.FRONTEND_URL,
    LEARNING_POOL_SEED: process.env.LEARNING_POOL_SEED,
  };
  const gemini = {
    generateQuestions: jest.fn(),
    assessAnswer: jest.fn(),
    reviewQuestion: jest.fn(),
    answerFollowUp: jest.fn(),
  };
  const preferences = {
    interests: ['backend'],
    technologies: ['TypeScript'],
    difficulty: 'beginner',
  };
  let app: INestApplication;
  let database: DataSource;
  let setup: DataSource;
  let questions: QuestionsService;

  interface Account {
    id: string;
    token: string;
    email: string;
  }

  const quiz = (title: string): GeneratedQuestion => ({
    title,
    prompt: `Why does the ${title} fixture behave this way? ${randomUUID()}`,
    code: null,
    codeLanguage: null,
    topics: ['general'],
    difficulty: 'beginner',
    language: 'ja',
    referenceAnswer: 'Private fixture reference used only by the assessor.',
    rubric: ['Explain the mechanism'],
    format: 'choice',
    options: ['Option zero', 'Option one', 'Option two'],
    correctOption: 0,
    quickExplanation: 'Fixture explanation after a tap.',
    concept: `fixture-${randomUUID().slice(0, 8)}`,
  });

  /**
   * A learner with a real session and bearer token (no Origin, no cookie), created
   * without the public signup so the per-address signup limit does not apply.
   */
  async function learner(label: string): Promise<Account> {
    const suffix = randomUUID().slice(0, 8);
    const email = `${label}-${suffix}@example.test`;
    const [created] = await database.query(
      'INSERT INTO users (email,username) VALUES ($1,$2) RETURNING id',
      [email, `${label}_${suffix}`],
    );
    const session = await app.get(SessionsService).create(created.id);
    const token = await app.get(JwtService).signAsync({ sub: created.id, sid: session.id });
    return { id: created.id, token, email };
  }

  const send = (
    method: 'get' | 'post' | 'put' | 'delete' | 'patch',
    path: string,
    who: Account | null,
    body?: object,
  ) => {
    const call = request(app.getHttpServer())[method](`/api/v1${path}`);
    if (who) call.set('Authorization', `Bearer ${who.token}`);
    return body === undefined ? call : call.send(body);
  };

  const comment = async (who: Account, questionId: string, text: string, parentId?: string) =>
    (
      await send('post', `/learning/questions/${questionId}/comments`, who, {
        text,
        ...(parentId ? { parentId } : {}),
      }).expect(201)
    ).body as { id: string };

  const visibleTexts = async (who: Account | null, questionId: string) =>
    (
      (await send('get', `/learning/questions/${questionId}/comments`, who).expect(200)).body
        .comments as { text: string }[]
    ).map((entry) => entry.text);

  async function count(table: string, column: string, id: string): Promise<number> {
    const [row] = await database.query(
      `SELECT count(*)::int AS total FROM ${table} WHERE ${column} = $1`,
      [id],
    );
    return row.total;
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'account-safety-test-only-secret-at-least-32';
    process.env.FRONTEND_URL = origin;
    process.env.LEARNING_POOL_SEED = 'off';
    setup = new DataSource({ type: 'postgres', url: databaseUrl, entities: [], logging: false });
    await setup.initialize();
    await setup.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public');
    await setup.query(`CREATE SCHEMA "${schema}"`);
    const options = {
      type: 'postgres' as const,
      url: databaseUrl,
      schema,
      extra: { options: `-c search_path=${schema},public` },
      entities: [UserEntity, SessionEntity, ...LEARNING_ENTITIES],
      synchronize: false,
      logging: false,
    };
    const migrations = new DataSource({
      ...options,
      migrations: [
        Migrations1793888259896,
        PasswordAuthSessions1793930000000,
        LearningEngine1794000000000,
        TapQuizLearningLoop1794100000000,
        SocialLearningCommunity1794200000000,
        QuestionConcepts1794300000000,
        FixIPv4OctetQuestion1794310000000,
        AccountSafety1794400000000,
      ],
    });
    await migrations.initialize();
    await migrations.runMigrations({ transaction: 'all' });
    await migrations.destroy();
    gemini.assessAnswer.mockResolvedValue({
      score: 8,
      feedback: 'Fixture feedback',
      improvements: ['Explain the trade-off more clearly.'],
      explanation: 'Fixture explanation after assessment.',
    });
    gemini.reviewQuestion.mockResolvedValue({
      approved: true,
      referenceAnswer: 'Reviewed fixture reference.',
      rubric: ['Explain the mechanism'],
      reason: 'The question can be assessed.',
      correctOption: null,
      quickExplanation: null,
    });
    const module = await Test.createTestingModule({
      imports: [TypeOrmModule.forRoot(options), AuthModule, LearningModule],
    })
      .overrideProvider(GeminiService)
      .useValue(gemini)
      .compile();
    app = module.createNestApplication();
    app.useLogger(false);
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    await app.init();
    database = app.get(DataSource);
    questions = app.get(QuestionsService);
  }, 30000);

  afterAll(async () => {
    await app?.close();
    if (setup?.isInitialized) {
      await setup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await setup.destroy();
    }
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('migrates down and back up without losing the older report reasons', async () => {
    const reporter = await learner('migration');
    const question = await questions.insert(database.manager, quiz('migration'), 'ai', null);
    const insert = (reason: string) =>
      database.query(
        'INSERT INTO learning_question_reports (user_id,question_id,reason) VALUES ($1,$2,$3)',
        [reporter.id, question, reason],
      );
    const reasons = async () =>
      (
        await database.query(
          'SELECT reason FROM learning_question_reports WHERE user_id = $1 ORDER BY reason',
          [reporter.id],
        )
      ).map((row: { reason: string }) => row.reason);
    await insert('unclear');
    await insert('inappropriate');
    expect(await reasons()).toEqual(['inappropriate', 'unclear']);

    const runner = database.createQueryRunner();
    try {
      const migration = new AccountSafety1794400000000();
      await migration.down(runner);
      expect(
        await runner.query("SELECT to_regclass('learning_user_blocks') AS blocks"),
      ).toEqual([{ blocks: null }]);
      expect(await reasons()).toEqual(['unclear']);
      await expect(insert('inappropriate')).rejects.toThrow();
      await migration.up(runner);
      expect(
        await runner.query("SELECT to_regclass('learning_user_blocks') AS blocks"),
      ).toEqual([{ blocks: 'learning_user_blocks' }]);
      expect(await reasons()).toEqual(['unclear']);
      await insert('inappropriate');
    } finally {
      await runner.release();
    }
  });

  describe('reporting', () => {
    let author: Account;
    let reporter: Account;
    let bystander: Account;
    let questionId: string;

    beforeAll(async () => {
      [author, reporter, bystander] = [
        await learner('author'),
        await learner('reporter'),
        await learner('bystander'),
      ];
      questionId = await questions.insert(database.manager, quiz('report'), 'ai', null);
    });

    it('reports a comment once per reason, hides it from the reporter only, and validates input', async () => {
      const posted = await comment(author, questionId, 'Reportable fixture comment');
      const path = `/learning/questions/${questionId}/comments/${posted.id}/reports`;

      const first = await send('post', path, reporter, {
        reason: 'harassment',
        details: '  first details  ',
      }).expect(201);
      expect(first.body).toEqual({ id: expect.any(String), status: 'open' });
      const again = await send('post', path, reporter, {
        reason: 'harassment',
        details: 'updated details',
      }).expect(201);
      expect(again.body.id).toBe(first.body.id);
      await send('post', path, reporter, { reason: 'spam' }).expect(201);
      const rows = await database.query(
        'SELECT reason,details,status FROM learning_comment_reports WHERE comment_id = $1 ORDER BY reason',
        [posted.id],
      );
      expect(rows).toEqual([
        { reason: 'harassment', details: 'updated details', status: 'open' },
        { reason: 'spam', details: '', status: 'open' },
      ]);

      expect(await visibleTexts(reporter, questionId)).not.toContain('Reportable fixture comment');
      expect(await visibleTexts(bystander, questionId)).toContain('Reportable fixture comment');
      expect(await visibleTexts(null, questionId)).toContain('Reportable fixture comment');
      expect(await visibleTexts(author, questionId)).toContain('Reportable fixture comment');

      await send('post', path, reporter, { reason: 'bogus' }).expect(400);
      await send('post', path, reporter, { reason: 'spam', userId: author.id }).expect(400);
      await send('post', path, reporter, {}).expect(400);
      await send('post', path, reporter, { reason: 'spam', details: 'x'.repeat(1001) }).expect(400);
      await send('post', path, null, { reason: 'spam' }).expect(401);
      await request(app.getHttpServer())
        .post(`/api/v1${path}`)
        .set('Authorization', `Bearer ${reporter.token}`)
        .set('Origin', 'https://untrusted.example')
        .send({ reason: 'spam' })
        .expect(403);
    });

    it('refuses to report your own, a deleted, a missing or a misfiled comment', async () => {
      const reporter = await learner('second-reporter');
      const own = await comment(author, questionId, 'My own fixture comment');
      await send(
        'post',
        `/learning/questions/${questionId}/comments/${own.id}/reports`,
        author,
        { reason: 'spam' },
      ).expect(400);

      const removed = await comment(author, questionId, 'About to be deleted');
      await send('delete', `/learning/questions/${questionId}/comments/${removed.id}`, author).expect(
        204,
      );
      await send(
        'post',
        `/learning/questions/${questionId}/comments/${removed.id}/reports`,
        reporter,
        { reason: 'spam' },
      ).expect(404);
      await send(
        'post',
        `/learning/questions/${questionId}/comments/${randomUUID()}/reports`,
        reporter,
        { reason: 'spam' },
      ).expect(404);
      const other = await questions.insert(database.manager, quiz('other'), 'ai', null);
      await send(
        'post',
        `/learning/questions/${other}/comments/${own.id}/reports`,
        reporter,
        { reason: 'spam' },
      ).expect(404);
      await send(
        'post',
        `/learning/questions/${questionId}/comments/not-a-uuid/reports`,
        reporter,
        { reason: 'spam' },
      ).expect(400);
    });

    it('hides the replies of a reported root from the reporter and keeps the thread for others', async () => {
      const reporter = await learner('third-reporter');
      const root = await comment(author, questionId, 'Root to be reported');
      await comment(bystander, questionId, 'Reply under the root', root.id);
      await send(
        'post',
        `/learning/questions/${questionId}/comments/${root.id}/reports`,
        reporter,
        { reason: 'inappropriate' },
      ).expect(201);
      const seen = await visibleTexts(reporter, questionId);
      expect(seen).not.toContain('Root to be reported');
      expect(seen).not.toContain('Reply under the root');
      const others = await visibleTexts(bystander, questionId);
      expect(others).toEqual(
        expect.arrayContaining(['Root to be reported', 'Reply under the root']),
      );
    });

    it('accepts the inappropriate reason on a question report and rejects unknown ones', async () => {
      await send('post', `/learning/questions/${questionId}/reports`, reporter, {
        reason: 'inappropriate',
        details: 'offensive wording',
      }).expect(201);
      await send('post', `/learning/questions/${questionId}/reports`, reporter, {
        reason: 'spam',
      }).expect(400);
    });
  });

  describe('blocking', () => {
    let blocker: Account;
    let target: Account;
    let friend: Account;
    let blockedQuestion: string;
    let friendQuestion: string;
    let shared: string;

    beforeAll(async () => {
      [blocker, target, friend] = [
        await learner('blocker'),
        await learner('target'),
        await learner('friend'),
      ];
      blockedQuestion = await questions.insert(database.manager, quiz('blocked'), 'community', target.id);
      friendQuestion = await questions.insert(database.manager, quiz('friend'), 'community', friend.id);
      shared = await questions.insert(database.manager, quiz('shared'), 'ai', null);
    });

    it('validates what can be blocked and lists, repeats and lifts a block', async () => {
      await send('put', `/learning/blocks/${blocker.id}`, blocker).expect(400);
      await send('put', `/learning/blocks/${randomUUID()}`, blocker).expect(404);
      await send('put', '/learning/blocks/not-a-uuid', blocker).expect(400);
      await send('put', `/learning/blocks/${target.id}`, null).expect(401);
      await request(app.getHttpServer())
        .put(`/api/v1/learning/blocks/${target.id}`)
        .set('Authorization', `Bearer ${blocker.token}`)
        .set('Origin', 'https://untrusted.example')
        .expect(403);

      expect((await send('get', '/learning/blocks', blocker).expect(200)).body).toEqual({ users: [] });
      expect(
        (await send('put', `/learning/blocks/${target.id}`, blocker).expect(200)).body,
      ).toEqual({ blocked: true });
      await send('put', `/learning/blocks/${target.id}`, blocker).expect(200);
      const listed = (await send('get', '/learning/blocks', blocker).expect(200)).body.users;
      expect(listed).toEqual([
        { id: target.id, displayName: expect.stringMatching(/^target_/), avatarUrl: null },
      ]);
      expect(await count('learning_user_blocks', 'blocker_id', blocker.id)).toBe(1);
      // Blocks are private to the blocker.
      expect((await send('get', '/learning/blocks', target).expect(200)).body).toEqual({ users: [] });
      await send('get', '/learning/blocks', null).expect(401);

      await send('delete', `/learning/blocks/${target.id}`, blocker).expect(204);
      await send('delete', `/learning/blocks/${target.id}`, blocker).expect(204);
      expect((await send('get', '/learning/blocks', blocker).expect(200)).body).toEqual({ users: [] });
      await send('put', `/learning/blocks/${target.id}`, blocker).expect(200);
    });

    it("hides a blocked user's comments and the replies to them, for the blocker only", async () => {
      const root = await comment(target, shared, 'Blocked root comment');
      await comment(friend, shared, 'Friend reply to blocked root', root.id);
      await comment(friend, shared, 'Friend own comment');
      await comment(target, shared, 'Blocked reply', (await comment(friend, shared, 'Friend root')).id);

      const mine = await visibleTexts(blocker, shared);
      expect(mine).toEqual(expect.arrayContaining(['Friend own comment', 'Friend root']));
      for (const hidden of ['Blocked root comment', 'Friend reply to blocked root', 'Blocked reply'])
        expect(mine).not.toContain(hidden);
      for (const viewer of [friend, target, null]) {
        expect(await visibleTexts(viewer, shared)).toEqual(
          expect.arrayContaining([
            'Blocked root comment',
            'Friend reply to blocked root',
            'Blocked reply',
            'Friend own comment',
          ]),
        );
      }
    });

    it("hides a blocked user's published questions, creator page and explanations", async () => {
      expect((await send('get', `/learning/questions/${blockedQuestion}`, friend).expect(200)).body.question.id).toBe(
        blockedQuestion,
      );
      await send('get', `/learning/questions/${blockedQuestion}`, blocker).expect(404);
      await send('get', `/learning/questions/${friendQuestion}`, blocker).expect(200);
      await send('get', `/learning/questions/${blockedQuestion}`, null).expect(200);

      const community = async (who: Account | null) =>
        (
          (await send('get', '/learning/community?language=ja', who).expect(200)).body
            .questions as { id: string }[]
        ).map((entry) => entry.id);
      const forBlocker = await community(blocker);
      expect(forBlocker).toContain(friendQuestion);
      expect(forBlocker).not.toContain(blockedQuestion);
      expect(await community(friend)).toEqual(expect.arrayContaining([blockedQuestion, friendQuestion]));
      expect(await community(null)).toContain(blockedQuestion);

      await send('get', `/learning/creators/${target.id}`, blocker).expect(404);
      await send('get', `/learning/creators/${target.id}`, friend).expect(200);
      await send('get', `/learning/creators/${target.id}`, null).expect(200);
      await send('get', `/learning/creators/${friend.id}`, blocker).expect(200);

      // A question saved before its author was blocked leaves the saved list.
      await send('put', `/learning/questions/${blockedQuestion}/save`, friend, { saved: true }).expect(200);
      const saved = async () =>
        ((await send('get', '/learning/saved', friend).expect(200)).body.questions as { id: string }[]).map(
          (entry) => entry.id,
        );
      expect(await saved()).toContain(blockedQuestion);
      await send('put', `/learning/blocks/${target.id}`, friend).expect(200);
      expect(await saved()).not.toContain(blockedQuestion);
      await send('delete', `/learning/blocks/${target.id}`, friend).expect(204);
      expect(await saved()).toContain(blockedQuestion);
    });

    it('shows everything again after the block is lifted', async () => {
      await send('delete', `/learning/blocks/${target.id}`, blocker).expect(204);
      expect(await visibleTexts(blocker, shared)).toEqual(
        expect.arrayContaining(['Blocked root comment', 'Blocked reply']),
      );
      await send('get', `/learning/questions/${blockedQuestion}`, blocker).expect(200);
      await send('get', `/learning/creators/${target.id}`, blocker).expect(200);
    });
  });

  describe('account deletion', () => {
    it('only keeps foreign keys that cascade or clear, so no table can block a deletion', async () => {
      const rows: { table_name: string; confdeltype: string }[] = await database.query(
        `SELECT conrelid::regclass::text AS table_name, confdeltype FROM pg_constraint
        WHERE contype = 'f' AND confrelid = 'users'::regclass`,
      );
      expect(rows.length).toBeGreaterThanOrEqual(12);
      expect(rows.filter((row) => !['c', 'n'].includes(row.confdeltype))).toEqual([]);
      expect(rows.map((row) => row.table_name)).toEqual(
        expect.arrayContaining(['sessions', 'learning_user_blocks', 'learning_comment_reports']),
      );
    });

    it('deletes a bearer account with no Origin and everything it owns, keeping other learners intact', async () => {
      const leaving = await learner('leaving');
      const staying = await learner('staying');
      await send('put', '/learning/preferences', leaving, preferences).expect(200);
      await send('put', '/learning/preferences', staying, preferences).expect(200);

      const quizId = await questions.insert(database.manager, quiz('tap'), 'ai', null);
      const stayingQuestion = await questions.insert(database.manager, quiz('staying'), 'community', staying.id);
      await send('post', `/learning/questions/${quizId}/taps`, leaving, { choice: 0 }).expect(200);
      await send('post', `/learning/questions/${quizId}/taps`, staying, { choice: 0 }).expect(200);
      await send('post', `/learning/questions/${stayingQuestion}/attempts`, leaving, {
        requestId: randomUUID(),
        answer: 'pass because the fixture says so',
      }).expect(200);
      await send('put', `/learning/questions/${quizId}/like`, leaving, { liked: true }).expect(200);
      await send('put', `/learning/questions/${quizId}/save`, leaving, { saved: true }).expect(200);

      const published = await send('post', '/learning/questions', leaving, {
        requestId: randomUUID(),
        title: 'Leaving learner question',
        prompt: 'Why is a published question kept without its author after deletion?',
        topics: ['general'],
        difficulty: 'beginner',
        language: 'ja',
        referenceAnswer: 'Because other learners rely on the shared question.',
      }).expect(201);
      const publishedId: string = published.body.question.id;
      const theirs = await comment(leaving, quizId, 'Comment that goes away');
      const stayersComment = await comment(staying, quizId, 'Stayer comment survives');
      await comment(staying, quizId, 'Reply to the leaving learner', theirs.id);
      await send('put', `/learning/questions/${quizId}/comments/${stayersComment.id}/helpful`, leaving, {
        helpful: true,
      }).expect(200);
      await send('post', `/learning/questions/${quizId}/comments/${stayersComment.id}/reports`, leaving, {
        reason: 'spam',
      }).expect(201);
      await send('post', `/learning/questions/${quizId}/reports`, leaving, { reason: 'unclear' }).expect(201);
      await send('put', `/learning/blocks/${staying.id}`, leaving).expect(200);
      await send('put', `/learning/blocks/${leaving.id}`, staying).expect(200);
      expect(await visibleTexts(null, quizId)).toContain('Comment that goes away');
      expect(
        (await send('get', '/learning/leaderboard', null).expect(200)).body.entries.map(
          (entry: { user: { id: string } }) => entry.user.id,
        ),
      ).toContain(leaving.id);

      const tables: [string, string][] = [
        ['sessions', 'user_id'],
        ['learning_preferences', 'user_id'],
        ['learning_operations', 'user_id'],
        ['learning_attempts', 'user_id'],
        ['learning_question_progress', 'user_id'],
        ['learning_taps', 'user_id'],
        ['learning_reactions', 'user_id'],
        ['learning_comments', 'user_id'],
        ['learning_comment_helpful', 'user_id'],
        ['learning_question_reports', 'user_id'],
        ['learning_comment_reports', 'user_id'],
        ['learning_user_blocks', 'blocker_id'],
        ['learning_user_blocks', 'blocked_id'],
      ];
      for (const [table, column] of tables)
        expect(await count(table, column, leaving.id)).toBeGreaterThan(0);

      // The server answers with 204 and no body, and the same token stops working at once.
      const deleted = await send('delete', '/auth/me', leaving).expect(204);
      expect(deleted.text).toBe('');
      expect(deleted.headers['cache-control']).toContain('no-store');
      await send('get', '/auth/me', leaving).expect(401);
      await send('delete', '/auth/me', leaving).expect(401);
      await send('get', '/learning/progress', leaving).expect(401);

      expect(await count('users', 'id', leaving.id)).toBe(0);
      for (const [table, column] of tables)
        expect([table, await count(table, column, leaving.id)]).toEqual([table, 0]);

      // Published content stays, detached from the person.
      const [kept] = await database.query(
        'SELECT author_id,source,title FROM learning_questions WHERE id = $1',
        [publishedId],
      );
      expect(kept).toEqual({
        author_id: null,
        source: 'community',
        title: 'Leaving learner question',
      });
      const publicQuestion = (await send('get', `/learning/questions/${publishedId}`, null).expect(200))
        .body.question;
      expect(publicQuestion.author).toBeNull();
      expect(JSON.stringify(publicQuestion)).not.toContain(leaving.email);

      // Other learners keep their own data and the reply stays out of sight with its parent.
      expect(await count('users', 'id', staying.id)).toBe(1);
      expect(await count('learning_taps', 'user_id', staying.id)).toBe(1);
      expect(await visibleTexts(null, quizId)).toEqual(['Stayer comment survives']);
      expect(await count('learning_user_blocks', 'blocker_id', staying.id)).toBe(0);
      await send('get', '/auth/me', staying).expect(200);
      expect(
        (await send('get', '/learning/leaderboard', null).expect(200)).body.entries.map(
          (entry: { user: { id: string } }) => entry.user.id,
        ),
      ).not.toContain(leaving.id);

      // The same email and username can be registered again as a brand-new account.
      const [email, username] = [leaving.email, `leaving_again_${randomUUID().slice(0, 6)}`];
      const again = await request(app.getHttpServer())
        .post('/api/v1/auth/mobile/signup')
        .send({ email, username, password: 'fixture safety password only' })
        .expect(201);
      const fresh = await send('get', '/auth/me', { token: again.body.token } as Account).expect(200);
      expect(fresh.body.id).not.toBe(leaving.id);
    });

    it('requires the web origin for cookie sessions, clears the cookie and keeps the account on refusal', async () => {
      const suffix = randomUUID().slice(0, 8);
      const signup = await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .set('Origin', origin)
        .send({
          email: `web-${suffix}@example.test`,
          username: `web_${suffix}`,
          password: 'fixture safety password only',
        })
        .expect(201);
      const cookie = (signup.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
      const me = await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', cookie).expect(200);

      await request(app.getHttpServer()).delete('/api/v1/auth/me').set('Cookie', cookie).expect(403);
      await request(app.getHttpServer())
        .delete('/api/v1/auth/me')
        .set('Cookie', cookie)
        .set('Origin', 'https://untrusted.example')
        .expect(403);
      await request(app.getHttpServer()).delete('/api/v1/auth/me').expect(401);
      expect(await count('users', 'id', me.body.id)).toBe(1);
      await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', cookie).expect(200);

      const deleted = await request(app.getHttpServer())
        .delete('/api/v1/auth/me')
        .set('Cookie', cookie)
        .set('Origin', origin)
        .expect(204);
      const cleared = (deleted.headers['set-cookie'] as unknown as string[]).find((value) =>
        value.startsWith('access_token='),
      );
      expect(cleared).toMatch(/access_token=;/);
      expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
      expect(await count('users', 'id', me.body.id)).toBe(0);
      await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', cookie).expect(401);
    });

    it('rate limits repeated deletion attempts per address', async () => {
      const responses: number[] = [];
      for (let attempt = 0; attempt < 5; attempt++) {
        const account = await learner('limit');
        responses.push((await send('delete', '/auth/me', account)).status);
      }
      expect(responses).toContain(429);
      expect(responses.filter((status) => status === 204).length).toBeLessThan(5);
    });
  });
});
