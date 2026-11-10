import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { INestApplication, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import axios from 'axios';
import { DataSource } from 'typeorm';
import { UserEntity } from '../src/entities/user.entity';
import { SessionEntity } from '../src/auth/sessions/session.entity';
import { AuthModule } from '../src/auth/auth.module';
import { LearningModule } from '../src/learning/learning.module';
import { LEARNING_ENTITIES } from '../src/learning/entities/learning.entity';
import { LearningOperationsService } from '../src/learning/learning-operations.service';
import { QuestionsService } from '../src/learning/questions.service';
import { GeminiService } from '../src/learning/gemini/gemini.service';
import { Migrations1793888259896 } from '../migrations/1793888259896-Migrations';
import { PasswordAuthSessions1793930000000 } from '../migrations/1793930000000-PasswordAuthSessions';
import { LearningEngine1794000000000 } from '../migrations/1794000000000-LearningEngine';
import { TapQuizLearningLoop1794100000000 } from '../migrations/1794100000000-TapQuizLearningLoop';
import { QuestionConcepts1794300000000 } from '../migrations/1794300000000-QuestionConcepts';
import { FixIPv4OctetQuestion1794310000000 } from '../migrations/1794310000000-FixIPv4OctetQuestion';
import { ClarifyIPv4OctetExplanation1794410000000 } from '../migrations/1794410000000-ClarifyIPv4OctetExplanation';
import { GuestAnswerImport1794420000000 } from '../migrations/1794420000000-GuestAnswerImport';
import { SocialLearningCommunity1794200000000 } from '../migrations/1794200000000-SocialLearningCommunity';
import { AccountSafety1794400000000 } from '../migrations/1794400000000-AccountSafety';
import type { GeneratedQuestion } from '../src/learning/gemini/gemini.types';
import { readPoolFile } from '../src/learning/question-pool.seeder';
import { learningWeek } from '../src/learning/learning-calendar';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) {
  const parsed = new URL(databaseUrl);
  if (
    !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) ||
    !/^\/whylint_auth_e2e_[a-z0-9_]+$/.test(parsed.pathname)
  ) {
    throw new Error(
      'Learning tests require a disposable local whylint_auth_e2e_* database',
    );
  }
}

const describeDatabase = databaseUrl ? describe : describe.skip;
describeDatabase('Learning engine (HTTP and disposable PostgreSQL)', () => {
  const schema = `learning_test_${randomUUID().replaceAll('-', '')}`;
  const origin = 'http://localhost:4200';
  const preferences = {
    interests: ['backend', 'security'],
    technologies: ['Rust', 'TypeScript'],
    difficulty: 'beginner',
  };
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
  let app: INestApplication;
  let database: DataSource;
  let setup: DataSource;
  let cookies: string[] = [];
  let users: string[] = [];
  let firstBatch: any;
  let communityQuestion: any;

  const generated = (): GeneratedQuestion[] =>
    Array.from({ length: 5 }, (_, index) => ({
      title: `Fixture question ${index}`,
      prompt: `Why does this fixture concept work? ${randomUUID()}`,
      code: index === 1 ? 'const value = 1;' : null,
      codeLanguage: index === 1 ? 'TypeScript' : null,
      topics: index === 0 ? ['general', 'jwt'] : ['backend'],
      difficulty: 'beginner',
      language: 'ja',
      referenceAnswer: 'Private fixture reference used only by the assessor.',
      rubric: ['Identify the mechanism', 'Explain the consequence'],
      format: 'choice',
      options: ['Option zero', 'Option one', 'Option two'],
      correctOption: index % 3,
      quickExplanation: 'Private-free quick explanation shown after a tap.',
      concept: `fixture-${randomUUID().slice(0, 8)}`,
    }));

  function write(
    path: string,
    body: string | object | undefined,
    learner = 0,
    method: 'post' | 'put' | 'patch' | 'delete' = 'post',
  ) {
    return request(app.getHttpServer())
      [method](`/api/v1/learning${path}`)
      .set('Origin', origin)
      .set('Cookie', cookies[learner])
      .send(body);
  }
  function read(path: string, learner = 0) {
    return request(app.getHttpServer())
      .get(`/api/v1/learning${path}`)
      .set('Cookie', cookies[learner]);
  }
  function expectPublicQuestion(question: any) {
    const keys = Object.keys(question).filter(
      (key) => key !== 'reason' && key !== 'review',
    );
    expect(keys.sort()).toEqual(
      [
        'author',
        'format',
        'options',
        'tap',
        'references',
        'novelty',
        'concept',
        'code',
        'codeLanguage',
        'createdAt',
        'difficulty',
        'id',
        'language',
        'liked',
        'likes',
        'prompt',
        'saved',
        'source',
        'title',
        'topics',
      ].sort(),
    );
    expect(JSON.stringify(question)).not.toContain('Private fixture reference');
    expect(question).not.toHaveProperty('correctOption');
    if (!question.tap)
      expect(JSON.stringify(question)).not.toContain('quick explanation');
    expect(JSON.stringify(question)).not.toContain('@example.test');
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'learning-test-only-secret-at-least-32-characters';
    process.env.FRONTEND_URL = origin;
    process.env.LEARNING_POOL_SEED = 'off';
    setup = new DataSource({
      type: 'postgres',
      url: databaseUrl,
      entities: [],
      synchronize: false,
      logging: false,
    });
    await setup.initialize();
    await setup.query(
      'CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public',
    );
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
        ClarifyIPv4OctetExplanation1794410000000,
        GuestAnswerImport1794420000000,
      ],
    });
    await migrations.initialize();
    await migrations.runMigrations({ transaction: 'all' });
    await migrations.destroy();
    gemini.generateQuestions.mockImplementation(async () => generated());
    gemini.assessAnswer.mockImplementation(
      async (_question, answer: string) => ({
        score: answer.startsWith('pass') ? 8 : 7,
        feedback: 'Fixture feedback',
        improvements: ['Explain the trade-off more clearly.'],
        explanation: 'Fixture explanation after assessment.',
      }),
    );
    gemini.reviewQuestion.mockResolvedValue({
      approved: true,
      referenceAnswer: 'Reviewed fixture reference.',
      rubric: ['Explain the mechanism', 'Explain its consequences'],
      reason: 'The question can be assessed.',
      correctOption: null,
      quickExplanation: null,
    });
    gemini.answerFollowUp.mockResolvedValue({
      answer: 'Fixture tutor answer.',
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
    for (let index = 0; index < 3; index++) {
      const suffix = randomUUID().slice(0, 8);
      const signup = await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .set('Origin', origin)
        .send({
          email: `learning-${suffix}@example.test`,
          username: `learner_${suffix}`,
          password: 'fixture learning password only',
        })
        .expect(201);
      cookies.push(
        (signup.headers['set-cookie'] as unknown as string[])[0].split(';')[0],
      );
      const me = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Cookie', cookies[index])
        .expect(200);
      users.push(me.body.id);
      await write('/preferences', preferences, index, 'put').expect(200);
    }
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

  it('publishes a broad catalog and syncs only valid, bounded preferences', async () => {
    const catalog = await read('/catalog').expect(200);
    expect(catalog.body.interests).toHaveLength(6);
    expect(catalog.body.technologies.length).toBeGreaterThan(100);
    expect((await read('/preferences')).body.preferences).toEqual(preferences);
    await write(
      '/preferences',
      { ...preferences, interests: ['not-an-interest'] },
      0,
      'put',
    ).expect(400);
    await write(
      '/preferences',
      { ...preferences, userId: users[1] },
      0,
      'put',
    ).expect(400);
    await write(
      '/preferences',
      { ...preferences, technologies: ['Rust', 'rust'] },
      0,
      'put',
    ).expect(400);
    await request(app.getHttpServer())
      .put('/api/v1/learning/preferences')
      .set('Cookie', cookies[0])
      .set('Origin', 'https://untrusted.example')
      .send(preferences)
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/learning/feed/batches')
      .set('Origin', origin)
      .send({ requestId: randomUUID(), language: 'ja' })
      .expect(401);
  });

  it('generates exactly five private-rubric-safe questions and replays the same batch', async () => {
    const payload = { requestId: randomUUID(), language: 'ja' };
    const response = await write('/feed/batches', payload).expect(200);
    firstBatch = response.body;
    expect(firstBatch.questions).toHaveLength(5);
    firstBatch.questions.forEach(expectPublicQuestion);
    expect(gemini.generateQuestions).toHaveBeenLastCalledWith(
      { ...preferences, strongTopics: [] },
      'ja',
      [],
      [],
      expect.any(Function),
      [],
    );
    const calls = gemini.generateQuestions.mock.calls.length;
    expect((await write('/feed/batches', payload).expect(200)).body).toEqual(
      firstBatch,
    );
    expect(gemini.generateQuestions).toHaveBeenCalledTimes(calls);
    await write('/feed/batches', { ...payload, language: 'en' }).expect(409);
    await write('/feed/batches', payload, 1).expect(409);
  });

  it('drops a truncated AI snippet and tops the batch up instead of failing', async () => {
    const incomplete = generated();
    incomplete[0].code = 'const user = { name:';
    incomplete[0].codeLanguage = 'javascript';
    const allIncomplete = generated().map((question) => ({
      ...question,
      code: 'const user = { name:',
      codeLanguage: 'javascript',
    }));
    const wrap = (questions: ReturnType<typeof generated>) => ({
      data: {
        candidates: [
          {
            finishReason: 'STOP',
            content: { parts: [{ text: JSON.stringify({ questions }) }] },
          },
        ],
      },
    });
    const post = jest.spyOn(axios, 'post');
    post.mockResolvedValueOnce(wrap(incomplete));
    const oldKey = process.env.GEMINI_API_KEY;
    const oldModel = process.env.GEMINI_MODEL;
    process.env.GEMINI_API_KEY = 'fixture-only-key';
    process.env.GEMINI_MODEL = 'fixture-model';
    gemini.generateQuestions.mockImplementationOnce(
      (preferences, language, weak, recent, retry) =>
        new GeminiService().generateQuestions(
          preferences,
          language,
          weak,
          recent,
          retry,
        ),
    );

    try {
      const input = { requestId: randomUUID(), language: 'ja' };
      const response = await write('/feed/batches', input, 2).expect(200);
      expect(response.body.questions).toHaveLength(5);
      expect(
        response.body.questions.map((question) => question.code),
      ).not.toContain(incomplete[0].code);
      const [topUp] = await database.query(
        'SELECT generated_for FROM learning_questions WHERE id = $1',
        [response.body.questions[4].id],
      );
      expect(topUp.generated_for).not.toBe(users[2]);
      expect(post).toHaveBeenCalledTimes(1);
      const [operation] = await database.query(
        'SELECT call_count FROM learning_operations WHERE id = $1',
        [input.requestId],
      );
      expect(operation.call_count).toBe(1);
      const [stored] = await database.query(
        'SELECT count(*)::int AS count FROM learning_questions WHERE code = $1',
        [incomplete[0].code],
      );
      expect(stored.count).toBe(0);

      const [before] = await database.query(
        'SELECT count(*)::int AS count FROM learning_questions WHERE generated_for = $1',
        [users[2]],
      );
      post.mockResolvedValue(wrap(allIncomplete));
      gemini.generateQuestions.mockImplementationOnce(
        (preferences, language, weak, recent, retry) =>
          new GeminiService().generateQuestions(
            preferences,
            language,
            weak,
            recent,
            retry,
          ),
      );
      const failedInput = { requestId: randomUUID(), language: 'ja' };
      const failed = await write('/feed/batches', failedInput, 2).expect(503);
      expect(failed.body.code).toBe('INVALID_AI_RESPONSE');
      const [after] = await database.query(
        'SELECT count(*)::int AS count FROM learning_questions WHERE generated_for = $1',
        [users[2]],
      );
      expect(after.count).toBe(before.count);
      const [failedOperation] = await database.query(
        'SELECT status, call_count FROM learning_operations WHERE id = $1',
        [failedInput.requestId],
      );
      expect(failedOperation).toMatchObject({
        status: 'failed',
        call_count: 2,
      });
    } finally {
      post.mockRestore();
      if (oldKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = oldKey;
      if (oldModel === undefined) delete process.env.GEMINI_MODEL;
      else process.env.GEMINI_MODEL = oldModel;
    }
  });

  it('serializes simultaneous request IDs across different users', async () => {
    const payload = { requestId: randomUUID(), language: 'ja' };
    const responses = await Promise.all([
      write('/feed/batches', payload, 1),
      write('/feed/batches', payload, 2),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const rows = await database.query(
      'SELECT user_id, status FROM learning_operations WHERE id = $1',
      [payload.requestId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('complete');
  });

  it('rejects a duplicate in-flight batch without calling Gemini twice', async () => {
    let release!: () => void;
    let started!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const began = new Promise<void>((resolve) => {
      started = resolve;
    });
    gemini.generateQuestions.mockImplementationOnce(async () => {
      started();
      await waiting;
      return generated();
    });
    const payload = { requestId: randomUUID(), language: 'ja' };
    const first = write('/feed/batches', payload).then((value) => value);
    await began;
    try {
      const duplicate = await write('/feed/batches', payload).expect(409);
      expect(duplicate.body.code).toBe('REQUEST_IN_PROGRESS');
    } finally {
      release();
    }
    expect((await first).status).toBe(200);
  });

  it('keeps provider failures out of attempts and permits an idempotent retry', async () => {
    const id = firstBatch.questions[0].id;
    const input = { requestId: randomUUID(), answer: 'explain the mechanism' };
    gemini.assessAnswer.mockRejectedValueOnce(
      new ServiceUnavailableException({
        code: 'AI_UNAVAILABLE',
        message: 'Try again',
      }),
    );
    await write(`/questions/${id}/attempts`, input).expect(503);
    const rows = await database.query(
      'SELECT id FROM learning_attempts WHERE id = $1',
      [input.requestId],
    );
    expect(rows).toHaveLength(0);
    const grade = await write(`/questions/${id}/attempts`, input).expect(200);
    expect(grade.body.score).toBe(7);
    expect(grade.body.passed).toBe(false);
    expect(grade.body.xpAwarded).toBe(5);
    expect(
      (await read('/reviews')).body.questions.map((question) => question.id),
    ).toContain(id);
    expect((await read('/reviews', 1)).body.questions).toEqual([]);
  });

  it('passes at eight, removes failed practice, and awards at most twenty lifetime XP', async () => {
    const id = firstBatch.questions[0].id;
    const input = {
      requestId: randomUUID(),
      answer: 'pass by explaining the mechanism and consequence',
    };
    const grade = await write(`/questions/${id}/attempts`, input).expect(200);
    expect(grade.body.score).toBe(8);
    expect(grade.body.passed).toBe(true);
    expect(grade.body.xpAwarded).toBe(15);
    const calls = gemini.assessAnswer.mock.calls.length;
    expect(
      (await write(`/questions/${id}/attempts`, input).expect(200)).body,
    ).toEqual(grade.body);
    expect(gemini.assessAnswer).toHaveBeenCalledTimes(calls);
    const repeated = await write(`/questions/${id}/attempts`, {
      ...input,
      requestId: randomUUID(),
    }).expect(200);
    expect(repeated.body.xpAwarded).toBe(0);
    expect(
      (await read('/reviews')).body.questions.map((question) => question.id),
    ).not.toContain(id);
    const progress = (await read('/progress')).body;
    expect(progress).toMatchObject({
      totalXp: 20,
      level: 1,
      streak: 1,
      passedQuestions: 1,
      dailyGoal: 5,
      dailyCompleted: 1,
      timezone: 'Asia/Tokyo',
    });
    expect(
      progress.achievements.find((item) => item.id === 'first-pass').earned,
    ).toBe(true);
    const rankings = (await read('/leaderboard')).body;
    expect(rankings.entries.find((item) => item.user.id === users[0]).xp).toBe(
      20,
    );
    expect(JSON.stringify(rankings)).not.toContain('@example.test');
  });

  it('grades taps instantly, reveals answers only after a tap, and schedules missed reviews', async () => {
    const question = firstBatch.questions[1];
    expect(question.format).toBe('choice');
    expect(question.tap).toBeNull();
    const before = (await read(`/questions/${question.id}`)).body.question;
    expect(before.tap).toBeNull();
    expect(before).not.toHaveProperty('correctOption');

    const guest = await request(app.getHttpServer())
      .post(`/api/v1/learning/questions/${question.id}/taps`)
      .set('Origin', origin)
      .send({ choice: 1 })
      .expect(200);
    expect(guest.body).toMatchObject({
      correct: true,
      correctOption: 1,
      xpAwarded: 0,
      progress: null,
    });
    await request(app.getHttpServer())
      .post(`/api/v1/learning/questions/${question.id}/taps`)
      .set('Origin', 'https://untrusted.example')
      .send({ choice: 1 })
      .expect(403);
    await write(`/questions/${question.id}/taps`, { choice: 3 }).expect(400);
    await write(`/questions/${question.id}/taps`, { choice: '1' }).expect(400);

    const miss = await write(`/questions/${question.id}/taps`, {
      choice: 0,
    }).expect(200);
    expect(miss.body).toMatchObject({
      correct: false,
      choice: 0,
      correctOption: 1,
      quickExplanation: 'Private-free quick explanation shown after a tap.',
      xpAwarded: 0,
      review: false,
      combo: 0,
    });
    const [missed] = await database.query(
      `SELECT box,needs_review,due_at > now() AS later,
        due_at <= now() + interval '24 hours' AS within_a_day,
        to_char(due_at AT TIME ZONE 'Asia/Tokyo','HH24:MI') AS local_time,
        last_missed_at IS NOT NULL AS missed
      FROM learning_question_progress WHERE user_id = $1 AND question_id = $2`,
      [users[0], question.id],
    );
    expect(missed).toEqual({
      box: 1,
      needs_review: true,
      later: true,
      within_a_day: true,
      local_time: '09:00',
      missed: true,
    });
    expect(
      (await read('/reviews')).body.questions.map((item) => item.id),
    ).toContain(question.id);

    const relearn = await write(`/questions/${question.id}/taps`, {
      choice: 1,
    }).expect(200);
    expect(relearn.body).toMatchObject({
      correct: true,
      review: true,
      xpAwarded: 0,
      combo: 1,
    });
    const [cleared] = await database.query(
      `SELECT box,needs_review,due_at FROM learning_question_progress
      WHERE user_id = $1 AND question_id = $2`,
      [users[0], question.id],
    );
    expect(cleared).toEqual({ box: 0, needs_review: false, due_at: null });
    expect(
      (await read('/reviews')).body.questions.map((item) => item.id),
    ).not.toContain(question.id);
    const replay = await write(`/questions/${question.id}/taps`, {
      choice: 2,
    }).expect(200);
    expect(replay.body).toMatchObject({
      choice: 1,
      correct: true,
      review: false,
      xpAwarded: 0,
    });
    const after = (await read(`/questions/${question.id}`)).body.question;
    expect(after.tap).toEqual({
      choice: 1,
      correct: true,
      correctOption: 1,
      quickExplanation: 'Private-free quick explanation shown after a tap.',
    });

    const next = firstBatch.questions[2];
    const hit = await write(`/questions/${next.id}/taps`, { choice: 2 }).expect(
      200,
    );
    expect(hit.body).toMatchObject({ correct: true, xpAwarded: 5, combo: 2 });
    expect(hit.body.progress).toMatchObject({
      correctTaps: 1,
      answeredTaps: 2,
      combo: 2,
    });
    const explained = await write(`/questions/${next.id}/attempts`, {
      requestId: randomUUID(),
      answer: 'pass because the mechanism has a consequence',
    }).expect(200);
    expect(explained.body.xpAwarded).toBe(15);
    const progress = (await read('/progress')).body;
    expect(
      progress.achievements.find((item) => item.id === 'first-correct-tap')
        .earned,
    ).toBe(true);
    expect(progress.topics.length).toBeGreaterThan(0);
    const rankings = (await read('/leaderboard')).body;
    expect(rankings.entries.find((item) => item.user.id === users[0]).xp).toBe(
      40,
    );
  });

  it('serves instant pool questions to guests and learners without leaking answers', async () => {
    const poolId = randomUUID();
    await app.get(QuestionsService).insert(
      database.manager,
      {
        ...generated()[0],
        title: 'Pool question',
        prompt: 'Pool prompt for everyone?',
      },
      'ai',
      null,
      poolId,
    );
    const guest = await request(app.getHttpServer())
      .get(
        '/api/v1/learning/feed/pool?language=ja&topics=backend,jwt&difficulty=beginner',
      )
      .expect(200);
    expect(guest.body.questions.length).toBeGreaterThan(0);
    expect(guest.body.questions.length).toBeLessThanOrEqual(5);
    guest.body.questions.forEach(expectPublicQuestion);
    guest.body.questions.forEach((question) =>
      expect(question.format).not.toBe('explain'),
    );
    expect(guest.body.reviewQuestions).toEqual([]);
    const excluded = await request(app.getHttpServer())
      .get(`/api/v1/learning/feed/pool?language=ja&exclude=${poolId}`)
      .expect(200);
    expect(
      excluded.body.questions.map((question) => question.id),
    ).not.toContain(poolId);
    await request(app.getHttpServer())
      .get('/api/v1/learning/feed/pool?exclude=nope')
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/learning/feed/pool?language=fr')
      .expect(400);

    const learner = (await read('/feed/pool?language=ja')).body.questions.map(
      (item) => item.id,
    );
    expect(learner).not.toContain(firstBatch.questions[1].id);
    expect(learner).not.toContain(firstBatch.questions[0].id);
  });

  it('answers follow-ups only after an answer and caps them per question', async () => {
    const question = firstBatch.questions[3];
    const ask = (requestId = randomUUID(), learner = 0) =>
      write(
        `/questions/${question.id}/follow-ups`,
        { requestId, question: 'Why not option zero?' },
        learner,
      );
    expect((await ask()).status).toBe(400);
    await write(`/questions/${question.id}/taps`, { choice: 0 }).expect(200);
    const requestId = randomUUID();
    const first = await ask(requestId).expect(200);
    expect(first.body).toMatchObject({
      answer: 'Fixture tutor answer.',
      question: 'Why not option zero?',
    });
    const calls = gemini.answerFollowUp.mock.calls.length;
    expect((await ask(requestId).expect(200)).body).toEqual(first.body);
    expect(gemini.answerFollowUp).toHaveBeenCalledTimes(calls);
    expect(gemini.answerFollowUp.mock.calls[calls - 1][2]).toBe('Option zero');
    for (let index = 0; index < 4; index++) await ask().expect(200);
    expect((await ask()).body.code).toBe('FOLLOW_UP_LIMIT');
  });

  it('picks one shared daily challenge and ranks first solvers', async () => {
    const daily = (learner?: number) =>
      learner === undefined
        ? request(app.getHttpServer()).get('/api/v1/learning/daily?language=ja')
        : read('/daily?language=ja', learner);
    const guest = (await daily().expect(200)).body;
    expect(guest.question).not.toBeNull();
    expectPublicQuestion(guest.question);
    expect((await daily(1).expect(200)).body.question.id).toBe(
      guest.question.id,
    );
    const options = guest.question.options as string[];
    const correct = (
      await request(app.getHttpServer())
        .post(`/api/v1/learning/questions/${guest.question.id}/taps`)
        .set('Origin', origin)
        .send({ choice: 0 })
    ).body.correctOption;
    expect(correct).toBeLessThan(options.length);
    await write(
      `/questions/${guest.question.id}/taps`,
      { choice: correct },
      1,
    ).expect(200);
    const after = (await daily(1)).body;
    expect(after.solved).toBe(1);
    expect(after.solvers[0].user.id).toBe(users[1]);
    expect(after.you).toEqual({ correct: true, rank: 1 });
    expect(JSON.stringify(after)).not.toContain('@example.test');
  });

  it('serves skipped Practice questions once each day from 09:00 and adapts difficulty', async () => {
    const missed = firstBatch.questions[4];
    expect(
      (await write(`/questions/${missed.id}/taps`, { choice: 0 })).body.correct,
    ).toBe(false);
    const early = await write('/feed/batches', {
      requestId: randomUUID(),
      language: 'ja',
    }).expect(200);
    expect(
      early.body.reviewQuestions.map((question) => question.id),
    ).not.toContain(missed.id);
    await database.query(
      `UPDATE learning_question_progress SET due_at = now() - interval '1 minute'
      WHERE user_id = $1 AND question_id = $2`,
      [users[0], missed.id],
    );
    const duePool = await read('/feed/pool?language=ja').expect(200);
    expect(duePool.body.reviewQuestions.map((question) => question.id)).toContain(
      missed.id,
    );
    const batch = await write('/feed/batches', {
      requestId: randomUUID(),
      language: 'ja',
    }).expect(200);
    expect(batch.body.reviewQuestions.map((question) => question.id)).toContain(
      missed.id,
    );
    const review = batch.body.reviewQuestions.find(
      (question) => question.id === missed.id,
    );
    expect(review.review).toMatchObject({ box: 1 });
    expect(review.reason).toEqual({ kind: 'review', topic: null });
    const [served] = await database.query(
      `SELECT due_at > now() AS later,
        to_char(due_at AT TIME ZONE 'Asia/Tokyo','HH24:MI') AS local_time
      FROM learning_question_progress WHERE user_id = $1 AND question_id = $2`,
      [users[0], missed.id],
    );
    expect(served).toEqual({ later: true, local_time: '09:00' });
    const pool = (await read('/feed/pool?language=ja')).body;
    expect(pool.reviewQuestions.map((question) => question.id)).not.toContain(
      missed.id,
    );
    expect(
      (await read('/reviews')).body.questions.map((item) => item.id),
    ).toContain(missed.id);
    const solved = await write(`/questions/${missed.id}/taps`, {
      choice: 1,
    }).expect(200);
    expect(solved.body).toMatchObject({ correct: true, review: true });
    expect(
      (await read('/reviews')).body.questions.map((item) => item.id),
    ).not.toContain(missed.id);
    expect(batch.body.adaptation).toMatchObject({ previous: 'beginner' });

    for (const question of batch.body.questions.slice(0, 5)) {
      const reveal = (
        await request(app.getHttpServer())
          .post(`/api/v1/learning/questions/${question.id}/taps`)
          .set('Origin', origin)
          .send({ choice: 0 })
      ).body;
      await write(`/questions/${question.id}/taps`, {
        choice: reveal.correctOption,
      }).expect(200);
    }
    const more = await write('/feed/batches', {
      requestId: randomUUID(),
      language: 'ja',
    }).expect(200);
    const tapsAtLevel = await database.query(
      `SELECT count(*) FILTER (WHERE t.correct)::int AS correct FROM learning_taps t
      JOIN learning_questions q ON q.id = t.question_id
      WHERE t.user_id = $1 AND NOT t.review AND q.difficulty = 'beginner'`,
      [users[0]],
    );
    expect(tapsAtLevel[0].correct).toBeGreaterThanOrEqual(5);
    expect(more.body.adaptation).toMatchObject({
      previous: 'beginner',
      difficulty: 'intermediate',
      change: 'up',
    });
    expect(gemini.generateQuestions.mock.calls.at(-1)[0].difficulty).toBe(
      'intermediate',
    );
  });

  it("keeps reworded concepts from the learner's history out of new batches", async () => {
    const seenId = randomUUID();
    await app.get(QuestionsService).insert(
      database.manager,
      {
        ...generated()[0],
        title: 'Array length',
        prompt: 'What does fruits.length print after three items?',
        concept: 'array-length-history',
      },
      'ai',
      null,
      seenId,
    );
    await write(`/questions/${seenId}/taps`, { choice: 0 }, 1).expect(200);
    const fresh = generated();
    fresh[0] = {
      ...fresh[0],
      prompt: 'How many elements does this array report after push?',
      concept: 'array-length-history',
    };
    gemini.generateQuestions.mockImplementationOnce(async () => fresh);
    const batch = await write(
      '/feed/batches',
      { requestId: randomUUID(), language: 'ja' },
      1,
    ).expect(200);
    const call = gemini.generateQuestions.mock.calls.at(-1);
    expect(
      (call[5] as { concept?: string }[]).some(
        (question) => question.concept === 'array-length-history',
      ),
    ).toBe(true);
    expect(
      batch.body.questions.map((question) => question.novelty.concept ?? null),
    ).not.toContain('array-length-history');
    expect(
      batch.body.questions.map((question) => question.prompt),
    ).not.toContain(fresh[0].prompt);
    const pool = (await read('/feed/pool?language=ja', 1)).body.questions;
    expect(pool.map((question) => question.concept)).not.toContain(
      'array-length-history',
    );
  });

  it('persists likes and saved questions independently and scopes comment deletion', async () => {
    const id = firstBatch.questions[0].id;
    await write(`/questions/${id}/like`, { liked: true }, 0, 'put').expect(200);
    await write(`/questions/${id}/like`, { liked: true }, 0, 'put').expect(200);
    await write(`/questions/${id}/save`, { saved: true }, 0, 'put').expect(200);
    expect((await read(`/questions/${id}`)).body.question).toMatchObject({
      liked: true,
      likes: 1,
      saved: true,
    });
    expect((await read(`/questions/${id}`, 1)).body.question).toMatchObject({
      liked: false,
      likes: 1,
      saved: false,
    });
    expect((await read('/saved')).body.questions).toHaveLength(1);
    const comment = await write(`/questions/${id}/comments`, {
      text: '<script>plain text only</script>',
    }).expect(201);
    expect(comment.body.text).toBe('<script>plain text only</script>');
    expect(JSON.stringify(comment.body)).not.toContain('@example.test');
    await write(
      `/questions/${id}/comments/${comment.body.id}`,
      {},
      1,
      'delete',
    ).expect(404);
    await write(
      `/questions/${id}/comments/${comment.body.id}`,
      {},
      0,
      'delete',
    ).expect(204);
    expect((await read(`/questions/${id}/comments`)).body.comments).toEqual([]);
  });

  it('reviews community questions before publishing and inserts eligible posts for other learners', async () => {
    const submission = {
      requestId: randomUUID(),
      title: 'How do JWTs work?',
      prompt:
        'Why can a service validate a JWT without looking up session data?',
      topics: ['general', 'security'],
      difficulty: 'beginner',
      language: 'ja',
      referenceAnswer:
        'The receiver validates the signed claims with a trusted key.',
    };
    const reviewCalls = gemini.reviewQuestion.mock.calls.length;
    await write(
      '/questions',
      { ...submission, code: 'const value = 1;' },
      1,
    ).expect(400);
    await write(
      '/questions',
      { ...submission, codeLanguage: 'JavaScript' },
      1,
    ).expect(400);
    expect(gemini.reviewQuestion).toHaveBeenCalledTimes(reviewCalls);
    gemini.reviewQuestion.mockResolvedValueOnce({
      approved: false,
      referenceAnswer: '',
      rubric: [],
      reason: 'Clarify the question.',
    });
    await write('/questions', submission, 1).expect(400);
    const posted = await write('/questions', submission, 1).expect(201);
    communityQuestion = posted.body.question;
    const completedReviewCalls = gemini.reviewQuestion.mock.calls.length;
    const replay = await write('/questions', submission, 1).expect(201);
    expect(replay.body).toEqual(posted.body);
    expect(gemini.reviewQuestion).toHaveBeenCalledTimes(completedReviewCalls);
    const publishedRows = await database.query(
      'SELECT id FROM learning_questions WHERE author_id = $1',
      [users[1]],
    );
    expect(publishedRows).toHaveLength(1);
    expectPublicQuestion(communityQuestion);
    expect(communityQuestion.author.id).toBe(users[1]);
    expect(
      (await read('/community?language=ja')).body.questions.map(
        (question) => question.id,
      ),
    ).toContain(communityQuestion.id);
    const next = await write('/feed/batches', {
      requestId: randomUUID(),
      language: 'ja',
    }).expect(200);
    expect(next.body.questions).toHaveLength(5);
    expect(next.body.communityQuestion.id).toBe(communityQuestion.id);
    const ownGrade = await write(
      `/questions/${communityQuestion.id}/attempts`,
      { requestId: randomUUID(), answer: 'pass explaining my own question' },
      1,
    ).expect(200);
    expect(ownGrade.body.xpAwarded).toBe(0);
  });

  it('counts retries of the same failed provider request against the per-user budget', async () => {
    const operations = app.get(LearningOperationsService);
    const [user] = await database.query(
      `INSERT INTO users (email,username) VALUES ($1,$2) RETURNING id`,
      [
        `limit-${randomUUID()}@example.test`,
        `limit_${randomUUID().slice(0, 8)}`,
      ],
    );
    const id = randomUUID();
    for (let attempt = 0; attempt < 10; attempt++) {
      const claim = await operations.claim(user.id, id, 'feed', {
        language: 'ja',
      });
      await operations.fail(claim);
    }
    await expect(
      operations.claim(user.id, id, 'feed', { language: 'ja' }),
    ).rejects.toMatchObject({
      status: 429,
    });
  });

  it('counts an automatic replacement against the same provider-call budget', async () => {
    const operations = app.get(LearningOperationsService);
    const [user] = await database.query(
      `INSERT INTO users (email,username) VALUES ($1,$2) RETURNING id`,
      [
        `replacement-${randomUUID()}@example.test`,
        `replace_${randomUUID().slice(0, 8)}`,
      ],
    );
    for (let attempt = 0; attempt < 9; attempt++) {
      const claim = await operations.claim(user.id, randomUUID(), 'feed', {
        language: 'ja',
      });
      await operations.fail(claim);
    }
    const current = await operations.claim(user.id, randomUUID(), 'feed', {
      language: 'ja',
    });
    await expect(
      operations.recordFeedRetry(user.id, current),
    ).rejects.toMatchObject({
      status: 429,
    });
    await operations.fail(current);
  });

  it('prevents a stale generation lease from completing after another owner retries', async () => {
    const operations = app.get(LearningOperationsService);
    const id = randomUUID();
    const original = await operations.claim(users[2], id, 'feed', {
      language: 'ja',
    });
    await database.query(
      "UPDATE learning_operations SET expires_at = now() - interval '1 second' WHERE id = $1",
      [id],
    );
    const replacement = await operations.claim(users[2], id, 'feed', {
      language: 'ja',
    });
    expect(replacement.lease).not.toBe(original.lease);
    await expect(
      database.transaction((manager) =>
        operations.assertLease(manager, original),
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      operations.recordFeedRetry(users[2], original),
    ).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      operations.recordFeedRetry(users[0], replacement),
    ).rejects.toMatchObject({
      status: 409,
    });
    await operations.fail(original);
    const [row] = await database.query(
      'SELECT status FROM learning_operations WHERE id = $1',
      [id],
    );
    expect(row.status).toBe('pending');
    await operations.fail(replacement);
  });

  it('saves account language independently and preserves it for older preference clients', async () => {
    const updated = await write(
      '/preferences/language',
      { language: 'en' },
      0,
      'patch',
    ).expect(200);
    expect(updated.body.preferences).toEqual({
      ...preferences,
      language: 'en',
    });
    expect((await read('/preferences')).body.preferences.language).toBe('en');
    expect(
      (await read('/preferences', 1)).body.preferences.language,
    ).toBeUndefined();

    const olderClient = await write(
      '/preferences',
      preferences,
      0,
      'put',
    ).expect(200);
    expect(olderClient.body.preferences).toEqual({
      ...preferences,
      language: 'en',
    });
    const explicit = await write(
      '/preferences',
      { ...preferences, language: 'ja' },
      0,
      'put',
    ).expect(200);
    expect(explicit.body.preferences.language).toBe('ja');

    await write('/preferences/language', { language: 'fr' }, 0, 'patch').expect(
      400,
    );
    await write(
      '/preferences/language',
      { language: 'en', userId: users[1] },
      0,
      'patch',
    ).expect(400);
    await write(
      '/preferences',
      { ...preferences, language: null },
      0,
      'put',
    ).expect(400);
    await request(app.getHttpServer())
      .patch('/api/v1/learning/preferences/language')
      .set('Origin', origin)
      .send({ language: 'en' })
      .expect(401);
    await request(app.getHttpServer())
      .patch('/api/v1/learning/preferences/language')
      .set('Cookie', cookies[0])
      .set('Origin', 'https://untrusted.example')
      .send({ language: 'en' })
      .expect(403);
  });

  it('formats existing and cached question snippets without rewriting stored code', async () => {
    const counter =
      'function createCounter() { let count = 0; return function() { count++; return count; }; } const counter = createCounter(); console.log(counter());';
    const questions = app.get(QuestionsService);
    const id = await questions.insert(
      database.manager,
      {
        ...generated()[0],
        code: counter,
        codeLanguage: 'javascript',
      },
      'ai',
      users[0],
    );
    const response = await request(app.getHttpServer())
      .get(`/api/v1/learning/questions/${id}`)
      .expect(200);
    const question = response.body.question;
    expect(question.code).toContain('\n  let count = 0;\n');
    expect(question.code).toContain('\n    count++;\n');
    const [stored] = await database.query(
      'SELECT code FROM learning_questions WHERE id = $1',
      [id],
    );
    expect(stored.code).toBe(counter);

    const operations = app.get(LearningOperationsService);
    const payload = { requestId: randomUUID(), language: 'ja' };
    const preferences = (await read('/preferences')).body.preferences;
    const claim = await operations.claim(users[0], payload.requestId, 'feed', {
      language: payload.language,
      preferences,
    });
    const cached = {
      requestId: payload.requestId,
      questions: [
        { ...question, code: counter },
        ...firstBatch.questions.slice(1),
      ],
      communityQuestion: null,
    };
    await database.transaction((manager) =>
      operations.complete(manager, claim, cached),
    );
    const replay = await write('/feed/batches', payload).expect(200);
    expect(replay.body.questions[0].code).toBe(question.code);
    const [operation] = await database.query(
      'SELECT result FROM learning_operations WHERE id = $1',
      [payload.requestId],
    );
    expect(operation.result.questions[0].code).toBe(counter);
  });

  it('supports explanations, scoped replies, helpful votes and deleted-parent placeholders', async () => {
    const id = firstBatch.questions[0].id;
    const text = 'A clear explanation of the mechanism. '.repeat(40);
    const shared = await write(`/questions/${id}/comments`, {
      text,
      kind: 'explanation',
      requestId: randomUUID(),
    }).expect(201);
    expect(shared.body).toMatchObject({
      text: text.trim(),
      kind: 'explanation',
      parentId: null,
      helpfulCount: 0,
      helpful: false,
      deleted: false,
    });
    await write(
      `/questions/${id}/comments/${shared.body.id}/helpful`,
      { helpful: true },
      0,
      'put',
    ).expect(400);
    for (let retry = 0; retry < 2; retry++) {
      const vote = await write(
        `/questions/${id}/comments/${shared.body.id}/helpful`,
        { helpful: true },
        1,
        'put',
      ).expect(200);
      expect(vote.body).toEqual({ helpful: true, helpfulCount: 1 });
    }
    const viewer = (await read(`/questions/${id}/comments`, 1)).body.comments;
    expect(viewer.find((item) => item.id === shared.body.id).helpful).toBe(
      true,
    );
    const guest = await request(app.getHttpServer())
      .get(`/api/v1/learning/questions/${id}/comments`)
      .expect(200);
    expect(
      guest.body.comments.find((item) => item.id === shared.body.id).helpful,
    ).toBe(false);
    const reply = await write(
      `/questions/${id}/comments`,
      {
        text: 'Could you show an example?',
        kind: 'question',
        parentId: shared.body.id,
      },
      1,
    ).expect(201);
    await write(`/questions/${id}/comments`, {
      text: 'Nested reply',
      parentId: reply.body.id,
    }).expect(400);
    await write(`/questions/${firstBatch.questions[1].id}/comments`, {
      text: 'Wrong question',
      parentId: shared.body.id,
    }).expect(400);
    await write(
      `/questions/${id}/comments/${shared.body.id}`,
      {},
      1,
      'delete',
    ).expect(404);
    await write(
      `/questions/${id}/comments/${shared.body.id}`,
      {},
      0,
      'delete',
    ).expect(204);
    const remaining = (await read(`/questions/${id}/comments`)).body.comments;
    expect(remaining.find((item) => item.id === shared.body.id)).toMatchObject({
      deleted: true,
      text: '',
      helpfulCount: 0,
    });
    expect(remaining.find((item) => item.id === reply.body.id).parentId).toBe(
      shared.body.id,
    );
    await write(
      `/questions/${id}/comments/${shared.body.id}/helpful`,
      { helpful: true },
      1,
      'put',
    ).expect(404);
    await write(
      `/questions/${id}/comments/${reply.body.id}`,
      {},
      1,
      'delete',
    ).expect(204);
    expect(
      (await read(`/questions/${id}/comments`)).body.comments.some(
        (item) => item.id === shared.body.id,
      ),
    ).toBe(false);
  });

  it('replays contribution writes and rejects reused keys with different content', async () => {
    const id = firstBatch.questions[0].id;
    const payload = {
      text: 'My explicitly published explanation.',
      kind: 'explanation',
      requestId: randomUUID(),
    };
    const responses = await Promise.all([
      write(`/questions/${id}/comments`, payload).expect(201),
      write(`/questions/${id}/comments`, payload).expect(201),
    ]);
    expect(responses[0].body.id).toBe(responses[1].body.id);
    await write(`/questions/${id}/comments`, {
      ...payload,
      text: 'Different content',
    }).expect(409);
    await write(
      `/questions/${firstBatch.questions[1].id}/comments`,
      payload,
    ).expect(409);
    await write(`/questions/${id}/comments`, { text: 'x'.repeat(1001) }).expect(
      400,
    );
    const vote = await write(
      `/questions/${id}/comments/${responses[0].body.id}/helpful`,
      { helpful: true },
      1,
      'put',
    ).expect(200);
    expect(vote.body.helpfulCount).toBe(1);
    await write(
      `/questions/${id}/comments/${responses[0].body.id}/helpful`,
      { helpful: false },
      1,
      'put',
    ).expect(200);
  });

  it('exposes only published contributions on public creator profiles', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/learning/creators/${users[0]}`)
      .expect(200);
    expect(response.body.creator.id).toBe(users[0]);
    expect(Object.keys(response.body.creator).sort()).toEqual([
      'avatarUrl',
      'displayName',
      'id',
    ]);
    const ownProfile = (await read(`/creators/${users[0]}`)).body;
    expect(
      ownProfile.questions.every((question) => question.tap === null),
    ).toBe(true);
    expect(response.body.counts.explanations).toBeGreaterThan(0);
    expect(response.body.questions.length).toBeLessThanOrEqual(20);
    expect(response.body.explanations.length).toBeLessThanOrEqual(20);
    expect(response.body.explanations[0]).toHaveProperty('questionId');
    expect(response.body.explanations[0]).toHaveProperty('questionTitle');
    response.body.questions.forEach(expectPublicQuestion);
    const encoded = JSON.stringify(response.body);
    for (const field of [
      '@example.test',
      'referenceAnswer',
      'password_hash',
      'needs_review',
      'Private fixture reference',
    ]) {
      expect(encoded).not.toContain(field);
    }
    await request(app.getHttpServer())
      .get(`/api/v1/learning/creators/${randomUUID()}`)
      .expect(404);
  });

  it('upserts private reports and exposes curated further reading', async () => {
    const id = firstBatch.questions[0].id;
    const report = {
      reason: 'incorrect',
      details: 'Private report detail for team review.',
    };
    await request(app.getHttpServer())
      .post(`/api/v1/learning/questions/${id}/reports`)
      .set('Origin', origin)
      .send(report)
      .expect(401);
    const first = await write(`/questions/${id}/reports`, report).expect(201);
    const second = await write(`/questions/${id}/reports`, {
      ...report,
      details: 'Updated private report detail.',
    }).expect(201);
    expect(first.body).toEqual({ id: second.body.id, status: 'open' });
    const [count] = await database.query(
      'SELECT count(*)::int AS count FROM learning_question_reports WHERE user_id = $1 AND question_id = $2',
      [users[0], id],
    );
    expect(count.count).toBe(1);
    await write(`/questions/${id}/reports`, { reason: 'unsupported' }).expect(
      400,
    );
    await write(`/questions/${id}/reports`, {
      ...report,
      details: 'x'.repeat(1001),
    }).expect(400);
    const publicQuestion = (await read(`/questions/${id}`)).body.question;
    expect(publicQuestion.references.length).toBeGreaterThan(0);
    expect(
      publicQuestion.references.every((reference) =>
        reference.url.startsWith('https://'),
      ),
    ).toBe(true);
    expect(JSON.stringify(publicQuestion)).not.toContain('private report');
  });

  it('filters pool difficulty and keeps the shared daily question beginner-safe', async () => {
    const question = generated()[0];
    const advancedId = await app.get(QuestionsService).insert(
      database.manager,
      {
        ...question,
        language: 'en',
        difficulty: 'advanced',
        format: 'spot_bug',
        code: 'let count = 0;\ncount++;',
        codeLanguage: 'JavaScript',
        options: ['1', '2'],
        correctOption: 1,
      },
      'ai',
      null,
    );
    await app
      .get(QuestionsService)
      .insert(database.manager, { ...question, language: 'en' }, 'ai', null);
    const response = await request(app.getHttpServer())
      .get(
        '/api/v1/learning/feed/pool?language=en&difficulty=beginner&topics=backend',
      )
      .expect(200);
    expect(response.body.questions.length).toBeGreaterThan(0);
    expect(
      response.body.questions.every((item) => item.difficulty === 'beginner'),
    ).toBe(true);
    expect(response.body.questions.some((item) => item.id === advancedId)).toBe(
      false,
    );
    await database.query(
      `INSERT INTO learning_daily_challenges (day,language,question_id)
      VALUES ((now() AT TIME ZONE 'Asia/Tokyo')::date,'en',$1)
      ON CONFLICT (day,language) DO UPDATE SET question_id = EXCLUDED.question_id`,
      [advancedId],
    );
    const daily = await request(app.getHttpServer())
      .get('/api/v1/learning/daily?language=en')
      .expect(200);
    expect(daily.body.question.difficulty).toBe('beginner');
  });
  it('uses seen pool content for generation novelty and stable batch replay', async () => {
    const questionService = app.get(QuestionsService);
    const first = {
      ...generated()[0],
      language: 'en' as const,
      topics: ['variety'],
      code: null,
      codeLanguage: null,
      concept: null,
      prompt:
        'Why does a secure website use HTTPS instead of HTTP when handling personal user data? Choose the best explanation.',
    };
    const second = {
      ...first,
      prompt:
        'Why should a website use HTTPS instead of standard HTTP when transmitting personal data? Choose the best reason and explain why.',
    };
    const seenId = await questionService.insert(
      database.manager,
      first,
      'ai',
      null,
    );
    const duplicateId = await questionService.insert(
      database.manager,
      second,
      'ai',
      null,
    );
    const certificateId = await questionService.insert(
      database.manager,
      {
        ...first,
        prompt:
          'How does a browser validate a certificate chain to establish the server identity?',
      },
      'ai',
      null,
    );
    const pool = await request(app.getHttpServer())
      .get(
        `/api/v1/learning/feed/pool?language=en&difficulty=beginner&topics=variety&exclude=${seenId}`,
      )
      .expect(200);
    expect(pool.body.questions.map((question) => question.id)).not.toContain(
      duplicateId,
    );
    expect(pool.body.questions.map((question) => question.id)).toContain(
      certificateId,
    );

    gemini.generateQuestions.mockResolvedValueOnce([
      second,
      ...[2, 3, 4].map((value) => ({
        ...first,
        prompt: 'What does this code print?',
        code: `const value=${value};console.log(value);`,
        codeLanguage: 'javascript',
      })),
    ]);
    const body = {
      requestId: randomUUID(),
      language: 'en',
      excludeQuestionIds: [seenId],
    };
    const batch = await write('/feed/batches', body, 1).expect(200);
    expect(
      batch.body.questions.some(
        (question) => question.prompt === second.prompt,
      ),
    ).toBe(false);
    expect(batch.body.questions.length).toBeGreaterThanOrEqual(3);
    const generationContext = gemini.generateQuestions.mock.calls.at(-1)[5];
    expect(generationContext).toContainEqual({
      prompt: first.prompt,
      code: null,
      codeLanguage: null,
      concept: null,
    });
    expect(
      generationContext.every(
        (question) =>
          Object.keys(question).sort().join(',') ===
          'code,codeLanguage,concept,prompt',
      ),
    ).toBe(true);
    const replay = await write('/feed/batches', body, 1).expect(200);
    expect(replay.body).toEqual(batch.body);
    await write(
      '/feed/batches',
      { ...body, excludeQuestionIds: [duplicateId] },
      1,
    ).expect(409);
    await write(
      '/feed/batches',
      {
        requestId: randomUUID(),
        language: 'en',
        excludeQuestionIds: ['invalid'],
      },
      1,
    ).expect(400);
    await write(
      '/feed/batches',
      {
        requestId: randomUUID(),
        language: 'en',
        excludeQuestionIds: [seenId, seenId],
      },
      1,
    ).expect(400);
  });

  it('assigns unique places and gives the earlier XP total priority', async () => {
    const later = '00000000-0000-4000-8000-000000000001';
    const earlier = '00000000-0000-4000-8000-000000000002';
    await database.getRepository(UserEntity).insert([
      { id: later, email: 'ranking-later@example.test' },
      { id: earlier, email: 'ranking-earlier@example.test' },
    ]);
    const questionId = await app.get(QuestionsService).insert(database.manager, generated()[0], 'ai', null);
    const week = learningWeek();
    await database.query(
      `INSERT INTO learning_taps (user_id, question_id, choice, correct, xp_awarded, day, created_at)
       VALUES ($1,$3,0,true,5,$4,$5), ($2,$3,0,true,5,$4,$6)`,
      [
        later, earlier, questionId, week,
        `${week}T10:00:00+09:00`, `${week}T09:00:00+09:00`,
      ],
    );
    const ranking = (await read('/leaderboard').expect(200)).body.entries;
    expect(ranking.map((entry) => entry.rank)).toEqual(ranking.map((_, index) => index + 1));
    expect(
      ranking.filter((entry) => [earlier, later].includes(entry.user.id)).map((entry) => entry.user.id),
    ).toEqual([earlier, later]);
  });

  it('imports guest choices in order once, preserving previously answered questions', async () => {
    const learner = 2;
    const [correct, retried, existing, missing] = Array.from({ length: 4 }, () => randomUUID());
    await database.query(
      `INSERT INTO learning_questions
        (id,title,prompt,topics,difficulty,language,source,reference_answer,rubric,
         format,options,correct_option,quick_explanation)
        SELECT id,'Guest import fixture','Which option is correct?',ARRAY['general'],
          'beginner','en','ai','Fixture reference','[]','choice','["One","Two"]',1,'Two is correct'
        FROM unnest($1::uuid[]) AS input(id)`,
      [[correct, retried, existing]],
    );
    await database.query(
      'UPDATE learning_questions SET generated_for = $1 WHERE id = $2',
      [users[0], correct],
    );
    await write('/questions/' + existing + '/taps', { choice: 0 }, learner).expect(200);
    const before = (await read('/progress', learner).expect(200)).body;
    const batch = {
      accountId: users[learner],
      requestId: randomUUID(),
      answers: [
        { questionId: correct, choice: 1 },
        { questionId: retried, choice: 0 },
        { questionId: retried, choice: 1 },
        { questionId: existing, choice: 1 },
        { questionId: missing, choice: 1 },
      ],
    };
    await write('/guest-answers', batch, 0).expect(403);
    await write('/guest-answers', {
      ...batch, answers: [{ ...batch.answers[0], correct: true }],
    }, learner).expect(400);
    const imported = (await write('/guest-answers', batch, learner).expect(200)).body;
    expect(imported).toMatchObject({
      imported: 3,
      skipped: 2,
      progress: {
        totalXp: before.totalXp + 5,
        answeredTaps: before.answeredTaps + 2,
        correctTaps: before.correctTaps + 1,
        combo: 1,
      },
    });
    const replay = (await write('/guest-answers', batch, learner).expect(200)).body;
    expect(replay).toEqual(imported);
    const rows = await database.query(
      `SELECT question_id,choice,correct,review,xp_awarded
        FROM learning_taps WHERE user_id = $1 AND question_id = ANY($2::uuid[])
        ORDER BY created_at`,
      [users[learner], [existing, correct, retried]],
    );
    expect(rows).toEqual([
      { question_id: existing, choice: 0, correct: false, review: false, xp_awarded: 0 },
      { question_id: correct, choice: 1, correct: true, review: false, xp_awarded: 5 },
      { question_id: retried, choice: 0, correct: false, review: false, xp_awarded: 0 },
      { question_id: retried, choice: 1, correct: true, review: true, xp_awarded: 0 },
    ]);
  });

  it('repairs the saved IPv4 quiz while preserving its correct answer position and tap', async () => {
    const id = '48a72346-5684-4d6d-b79d-502bb9579f67';
    const seed = readPoolFile()!.questions.find((question) => question.id === id)!;
    const oldPrompt = 'Which line contains an invalid character that causes this IPv4 address check to fail? Select the buggy line number and explain why.';
    await database.query(
      `INSERT INTO learning_questions
        (id,title,prompt,code,code_language,topics,difficulty,language,source,reference_answer,rubric,
         format,options,correct_option,quick_explanation)
       VALUES ($1,'Invalid Character in IPv4 Address',$2,$3,'javascript',ARRAY['networking'],
         'beginner','en','ai','Old reference','[]','spot_bug','["1","2","3","4"]',3,'Old feedback')`,
      [id, oldPrompt, seed.code],
    );
    await database.query(
      `INSERT INTO learning_taps (user_id,question_id,choice,correct,xp_awarded,day)
       VALUES ($1,$2,3,true,5,$3)`,
      [users[0], id, learningWeek()],
    );
    const runner = database.createQueryRunner();
    try {
      await new FixIPv4OctetQuestion1794310000000().up(runner);
      await new ClarifyIPv4OctetExplanation1794410000000().up(runner);
    } finally {
      await runner.release();
    }
    const result = (await read('/questions/' + id).expect(200)).body.question;
    expect(result).toMatchObject({
      title: seed.title,
      prompt: seed.prompt,
      format: 'choice',
      options: ['1', '2', '3', '4'],
      tap: { choice: 3, correct: true, correctOption: 3, quickExplanation: seed.quickExplanation },
    });
    const [stored] = await database.query('SELECT xp_awarded FROM learning_taps WHERE question_id = $1', [id]);
    expect(stored.xp_awarded).toBe(5);
  });
});
