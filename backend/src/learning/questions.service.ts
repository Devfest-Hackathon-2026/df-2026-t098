import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { GeminiService } from './gemini/gemini.service';
import type { GeneratedQuestion } from './gemini/gemini.types';
import type { QuestionDto } from './dto/learning.dto';
import type {
  Difficulty,
  LearningLanguage,
  PublicAuthor,
  PublicQuestion,
  ReviewInfo,
} from './learning.types';
import { LearningOperationsService } from './learning-operations.service';
import { formatQuestionCode } from './question-code';
import { nextReviewAt } from './learning-schedule';
import { expandInterests, withInterestTags } from './learning.catalog';
import { learningReferences } from './learning.references';
import {
  normalizeConcept,
  questionNovelty,
  selectNovelQuestions,
  type NoveltyQuestion,
} from './question-novelty';

@Injectable()
export class QuestionsService {
  constructor(
    private readonly database: DataSource,
    private readonly gemini: GeminiService,
    private readonly operations: LearningOperationsService,
  ) {}

  async list(
    where: string,
    parameters: unknown[],
    userId: string | null = null,
    manager = this.database.manager,
  ): Promise<PublicQuestion[]> {
    const userParameter = parameters.length + 1;
    const rows = await manager.query(
      `SELECT q.id,q.title,q.prompt,q.code,q.code_language,q.topics,
      q.difficulty,q.language,q.source,q.author_id,q.created_at,q.format,q.options,q.concept,
      u.username,u.name,u.avatar_url,
      (SELECT json_build_object('choice',t.choice,'correct',t.correct,
        'correctOption',q.correct_option,'quickExplanation',q.quick_explanation)
        FROM learning_taps t WHERE t.question_id = q.id AND t.user_id = $${userParameter}
        ORDER BY t.created_at DESC LIMIT 1) AS tap,
      (SELECT json_build_object('box',p.box,'missedAt',p.last_missed_at)
        FROM learning_question_progress p WHERE p.question_id = q.id
        AND p.user_id = $${userParameter} AND p.needs_review) AS practice,
      (SELECT count(*)::int FROM learning_reactions r WHERE r.question_id = q.id AND r.liked) AS likes,
      coalesce((SELECT r.liked FROM learning_reactions r WHERE r.question_id = q.id AND r.user_id = $${userParameter}),false) AS liked,
      coalesce((SELECT r.saved FROM learning_reactions r WHERE r.question_id = q.id AND r.user_id = $${userParameter}),false) AS saved
      FROM learning_questions q LEFT JOIN users u ON u.id = q.author_id ${where}`,
      [...parameters, userId],
    );
    return Promise.all(
      rows.map(async (row) => {
        const question = await formatQuestionCode(this.toPublic(row));
        return { ...question, novelty: questionNovelty(question) };
      }),
    );
  }

  async question(
    id: string,
    userId: string | null = null,
  ): Promise<PublicQuestion> {
    const [question] = await this.list('WHERE q.id = $1', [id], userId);
    if (!question) throw new NotFoundException('Question not found');
    return question;
  }

  async gradingQuestion(
    id: string,
  ): Promise<GeneratedQuestion & { authorId: string | null }> {
    const [row] = await this.database.query(
      'SELECT * FROM learning_questions WHERE id = $1',
      [id],
    );
    if (!row) throw new NotFoundException('Question not found');
    return {
      title: row.title,
      prompt: row.prompt,
      code: row.code,
      codeLanguage: row.code_language,
      topics: row.topics,
      difficulty: row.difficulty,
      language: row.language,
      referenceAnswer: row.reference_answer,
      rubric: row.rubric,
      concept: row.concept ?? null,
      format: row.format === 'explain' ? null : row.format,
      options: row.options,
      correctOption: row.correct_option,
      quickExplanation: row.quick_explanation,
      authorId: row.author_id,
    };
  }

  async insert(
    manager: EntityManager,
    question: GeneratedQuestion,
    source: 'ai' | 'community',
    userId: string | null,
    id: string = randomUUID(),
  ): Promise<string> {
    const quiz = question.format && question.options;
    await manager.query(
      `INSERT INTO learning_questions
      (id,title,prompt,code,code_language,topics,difficulty,language,source,author_id,generated_for,
        reference_answer,rubric,format,options,correct_option,quick_explanation,concept)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15::jsonb,$16,$17,$18)
      ON CONFLICT (id) DO NOTHING`,
      [
        id,
        question.title,
        question.prompt,
        question.code,
        question.codeLanguage,
        withInterestTags(question.topics),
        question.difficulty,
        question.language,
        source,
        source === 'community' ? userId : null,
        source === 'ai' ? userId : null,
        question.referenceAnswer,
        JSON.stringify(question.rubric),
        quiz ? question.format : 'explain',
        quiz ? JSON.stringify(question.options) : null,
        quiz ? question.correctOption : null,
        quiz ? question.quickExplanation : null,
        normalizeConcept(question.concept),
      ],
    );
    return id;
  }

  async publish(
    userId: string,
    submission: QuestionDto,
  ): Promise<{ question: PublicQuestion }> {
    const code = submission.code?.trim() ? submission.code : null;
    const codeLanguage = submission.codeLanguage?.trim() || null;
    if ((code === null) !== (codeLanguage === null)) {
      throw new BadRequestException(
        'Code and its programming language must be provided together',
      );
    }
    const payload = {
      title: submission.title,
      prompt: submission.prompt,
      code,
      codeLanguage,
      topics: [
        ...new Set(submission.topics.map((topic) => topic.toLowerCase())),
      ].sort(),
      difficulty: submission.difficulty,
      language: submission.language,
      referenceAnswer: submission.referenceAnswer,
      ...this.submittedQuiz(submission, code),
    };
    const claim = await this.operations.claim(
      userId,
      submission.requestId,
      'publish',
      payload,
    );
    if (claim.replay) {
      const result = claim.replay as { question: PublicQuestion };
      return {
        question: await formatQuestionCode({
          ...result.question,
          references: learningReferences(result.question.topics),
          novelty: questionNovelty(result.question),
        }),
      };
    }
    try {
      const reviewed = await this.gemini.reviewQuestion(payload);
      if (!reviewed.approved)
        throw new BadRequestException({
          code: 'QUESTION_NEEDS_REVISION',
          message: reviewed.reason,
        });
      return await this.database.transaction(async (manager) => {
        await this.operations.assertLease(manager, claim);
        const id = await this.insert(
          manager,
          {
            ...payload,
            referenceAnswer: reviewed.referenceAnswer,
            rubric: reviewed.rubric,
            format: payload.format ?? null,
            options: payload.options ?? null,
            correctOption: reviewed.correctOption,
            quickExplanation: reviewed.quickExplanation,
            concept: reviewed.concept,
          },
          'community',
          userId,
        );
        const [question] = await this.list(
          'WHERE q.id = $1',
          [id],
          userId,
          manager,
        );
        const result = { question };
        await this.operations.complete(manager, claim, result);
        return result;
      });
    } catch (error) {
      await this.operations.fail(claim);
      throw error;
    }
  }

  /** Tap-quiz questions anyone can play instantly, without waiting for Gemini. */
  async pool(
    input: {
      language: LearningLanguage;
      topics: string[];
      difficulty: Difficulty | null;
      exclude: string[];
      limit: number;
      previous?: NoveltyQuestion[];
    },
    userId: string | null,
  ): Promise<PublicQuestion[]> {
    const topics = expandInterests(input.topics);
    const previous = [
      ...(input.previous ?? []),
      ...(await this.noveltyContext(input.exclude, userId)),
    ];
    const candidates = await this.list(
      `WHERE q.format <> 'explain' AND q.language = $1
      AND ($5::text IS NULL OR q.difficulty = $5) AND NOT (q.id = ANY($2::uuid[]))
      AND ($3::uuid IS NULL OR (q.generated_for IS DISTINCT FROM $3 AND q.author_id IS DISTINCT FROM $3
        AND NOT EXISTS (SELECT 1 FROM learning_taps t WHERE t.question_id = q.id AND t.user_id = $3)
        AND NOT EXISTS (SELECT 1 FROM learning_question_progress p
          WHERE p.question_id = q.id AND p.user_id = $3)))
      ORDER BY (q.topics && $4::text[]) DESC, ('general' = ANY(q.topics)) DESC,
        (q.difficulty = $5) DESC, random() LIMIT $6`,
      [
        input.language,
        input.exclude,
        userId,
        topics,
        input.difficulty,
        Math.min(100, input.limit * 20),
      ],
      userId,
    );
    return selectNovelQuestions(candidates, previous, input.limit);
  }

  /**
   * Public content of questions the learner has already met, used to avoid near-duplicates:
   * IDs the browser has shown this session, the learner's recent Gemini questions, what they
   * answered in the last 60 days on any device, and what recent feed batches served them.
   */
  async noveltyContext(
    ids: string[],
    userId: string | null,
  ): Promise<NoveltyQuestion[]> {
    return this.database.query(
      `SELECT prompt,code,code_language AS "codeLanguage",concept FROM learning_questions
      WHERE id = ANY($1::uuid[])
      OR id IN (SELECT id FROM learning_questions WHERE generated_for = $2::uuid
        ORDER BY created_at DESC,id DESC LIMIT 30)
      OR id IN (SELECT question_id FROM (
          SELECT question_id,created_at FROM learning_taps
          WHERE user_id = $2::uuid AND created_at > now() - interval '60 days'
          UNION ALL SELECT question_id,created_at FROM learning_attempts
          WHERE user_id = $2::uuid AND created_at > now() - interval '60 days'
        ) history ORDER BY created_at DESC LIMIT 150)
      OR id IN (SELECT (jsonb_array_elements(op.result->'questions')->>'id')::uuid
        FROM learning_operations op WHERE op.user_id = $2::uuid AND op.kind = 'feed'
        AND op.status = 'complete' AND op.created_at > now() - interval '7 days')
      ORDER BY (id = ANY($1::uuid[])) DESC,
        array_position($1::uuid[],id) DESC NULLS LAST,created_at DESC,id DESC LIMIT 400`,
      [ids, userId],
    );
  }

  /**
   * Practice questions due today (from 09:00). Serving one moves it to the next morning, so a
   * skipped question returns once a day until the learner answers it correctly.
   */
  async dueReviews(
    userId: string,
    language: LearningLanguage,
    limit: number,
    manager = this.database.manager,
  ): Promise<PublicQuestion[]> {
    // Select and reschedule atomically so parallel feed requests never serve one twice.
    if (!manager.queryRunner?.isTransactionActive)
      return this.database.transaction((transaction) =>
        this.dueReviews(userId, language, limit, transaction),
      );
    const rows: {
      question_id: string;
      box: number;
      last_missed_at: Date | null;
    }[] = await manager.query(
      `SELECT p.question_id,p.box,p.last_missed_at FROM learning_question_progress p
        JOIN learning_questions q ON q.id = p.question_id
        WHERE p.user_id = $1 AND p.needs_review AND p.due_at <= now() AND q.language = $2
        ORDER BY p.due_at,p.last_missed_at NULLS LAST,p.question_id LIMIT $3
        FOR UPDATE OF p SKIP LOCKED`,
      [userId, language, limit],
    );
    if (!rows.length) return [];
    await manager.query(
      `UPDATE learning_question_progress SET due_at = $3::timestamptz
      WHERE user_id = $1 AND question_id = ANY($2::uuid[]) AND needs_review`,
      [
        userId,
        rows.map((row) => row.question_id),
        nextReviewAt().toISOString(),
      ],
    );
    const questions = await this.list(
      'WHERE q.id = ANY($1::uuid[])',
      [rows.map((row) => row.question_id)],
      userId,
      manager,
    );
    return rows.flatMap((row) => {
      const question = questions.find(
        (candidate) => candidate.id === row.question_id,
      );
      if (!question) return [];
      const review: ReviewInfo = {
        box: row.box,
        missedAt: row.last_missed_at
          ? new Date(row.last_missed_at).toISOString()
          : null,
      };
      return [
        {
          ...question,
          review,
          reason: { kind: 'review' as const, topic: null },
        },
      ];
    });
  }

  async community(language: LearningLanguage, userId: string | null) {
    return {
      questions: await this.list(
        "WHERE q.source = 'community' AND q.language = $1 ORDER BY q.created_at DESC LIMIT 20",
        [language],
        userId,
      ),
    };
  }

  async communityForFeed(
    userId: string,
    language: LearningLanguage,
    topics: string[],
    manager: EntityManager,
  ): Promise<PublicQuestion | null> {
    const questions = await this.list(
      `WHERE q.source = 'community' AND q.language = $1
      AND q.author_id IS DISTINCT FROM $2::uuid AND q.topics && $3::text[]
      AND NOT EXISTS (SELECT 1 FROM learning_operations op WHERE op.user_id = $2
        AND op.kind = 'feed' AND op.status = 'complete' AND op.result->'communityQuestion'->>'id' = q.id::text)
      ORDER BY q.created_at DESC LIMIT 1`,
      [
        language,
        userId,
        ['general', ...topics.map((topic) => topic.toLowerCase())],
      ],
      userId,
      manager,
    );
    return questions[0] ?? null;
  }

  async saved(userId: string) {
    return {
      questions: await this.list(
        `WHERE EXISTS (SELECT 1 FROM learning_reactions r
      WHERE r.question_id = q.id AND r.user_id = $1 AND r.saved) ORDER BY q.created_at DESC LIMIT 100`,
        [userId],
        userId,
      ),
    };
  }

  async reviews(userId: string) {
    return {
      questions: await this.list(
        `WHERE EXISTS (SELECT 1 FROM learning_question_progress p
      WHERE p.question_id = q.id AND p.user_id = $1 AND p.needs_review)
      ORDER BY (SELECT p.due_at FROM learning_question_progress p
        WHERE p.question_id = q.id AND p.user_id = $1) ASC NULLS LAST,q.created_at DESC LIMIT 100`,
        [userId],
        userId,
      ),
    };
  }

  async like(userId: string, questionId: string, liked: boolean) {
    await this.question(questionId);
    await this.database.query(
      `INSERT INTO learning_reactions (user_id,question_id,liked) VALUES ($1,$2,$3)
      ON CONFLICT (user_id,question_id) DO UPDATE SET liked = EXCLUDED.liked, updated_at = now()`,
      [userId, questionId, liked],
    );
    const [row] = await this.database.query(
      'SELECT count(*)::int AS likes FROM learning_reactions WHERE question_id = $1 AND liked',
      [questionId],
    );
    return { liked, likes: row.likes };
  }

  async save(userId: string, questionId: string, saved: boolean) {
    await this.question(questionId);
    await this.database.query(
      `INSERT INTO learning_reactions (user_id,question_id,saved) VALUES ($1,$2,$3)
      ON CONFLICT (user_id,question_id) DO UPDATE SET saved = EXCLUDED.saved, updated_at = now()`,
      [userId, questionId, saved],
    );
    return { saved };
  }

  private toPublic(row: any): PublicQuestion {
    return {
      id: row.id,
      title: row.title,
      prompt: row.prompt,
      code: row.code,
      codeLanguage: row.code_language,
      topics: row.topics,
      difficulty: row.difficulty,
      language: row.language,
      source: row.source,
      author: row.author_id ? this.author(row, row.author_id) : null,
      likes: row.likes,
      liked: row.liked,
      saved: row.saved,
      createdAt: new Date(row.created_at).toISOString(),
      format: row.format ?? 'explain',
      concept: row.concept ?? null,
      options: row.options ?? null,
      tap: row.tap ?? null,
      // In the viewer's Practice collection: shown fresh so it can be answered again.
      ...(row.practice
        ? {
            review: {
              box: row.practice.box,
              missedAt: row.practice.missedAt
                ? new Date(row.practice.missedAt).toISOString()
                : null,
            },
          }
        : {}),
      references: learningReferences(row.topics),
      novelty: questionNovelty({
        prompt: row.prompt,
        code: row.code,
        codeLanguage: row.code_language,
        concept: row.concept,
      }),
    };
  }

  private submittedQuiz(submission: QuestionDto, code: string | null) {
    if (!submission.options?.length) return { format: null, options: null };
    const format = submission.format ?? 'choice';
    const options = submission.options.map((option) => option.trim());
    if (
      new Set(options.map((option) => option.toLowerCase())).size !==
      options.length
    )
      throw new BadRequestException('Quiz options must be different');
    if (format === 'true_false' && options.length !== 2)
      throw new BadRequestException(
        'True/false questions need exactly two options',
      );
    if ((format === 'predict_output' || format === 'spot_bug') && !code)
      throw new BadRequestException('This quiz format needs a code example');
    if (format === 'spot_bug') {
      const lines = code!.split('\n').length;
      if (
        options.some(
          (option) =>
            !/^\d{1,3}$/.test(option) || +option < 1 || +option > lines,
        )
      )
        throw new BadRequestException(
          'Spot-the-bug options must be line numbers in the code',
        );
    }
    if (
      submission.correctOption === undefined ||
      submission.correctOption < 0 ||
      submission.correctOption >= options.length
    )
      throw new BadRequestException('Choose the correct option');
    return { format, options, correctOption: submission.correctOption };
  }

  private author(row: any, id: string): PublicAuthor {
    return {
      id,
      displayName: row.username || row.name || 'Learner',
      avatarUrl: row.avatar_url ?? null,
    };
  }
}
