import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AssessmentService } from './assessment.service';
import { GeminiService } from './gemini/gemini.service';
import { learningDay } from './learning-calendar';
import { LearningOperationsService } from './learning-operations.service';
import {
  nextSchedule,
  scheduleParameters,
  SCHEDULE_SQL,
} from './learning-schedule';
import type {
  LearningLanguage,
  PublicAuthor,
  PublicQuestion,
} from './learning.types';
import { QuestionsService } from './questions.service';
import type { FollowUpDto } from './dto/learning.dto';

/** XP for the first correct tap. A passed explanation adds the rest of the 20 XP cap. */
export const TAP_XP = 5;

export interface TapResult {
  questionId: string;
  choice: number;
  correct: boolean;
  correctOption: number;
  quickExplanation: string;
  xpAwarded: number;
  review: boolean;
  combo: number | null;
  progress: Awaited<ReturnType<AssessmentService['progress']>> | null;
}

export interface FollowUpResult {
  id: string;
  questionId: string;
  question: string;
  answer: string;
  createdAt: string;
}

interface TapRow {
  format: string;
  options: string[] | null;
  correct_option: number | null;
  quick_explanation: string | null;
  author_id: string | null;
}

@Injectable()
export class PracticeService {
  constructor(
    private readonly database: DataSource,
    private readonly gemini: GeminiService,
    private readonly operations: LearningOperationsService,
    private readonly questions: QuestionsService,
    private readonly assessment: AssessmentService,
  ) {}

  /**
   * Grades a tap instantly from stored data. The first tap on a question earns XP and is
   * final; a missed question can be retried while it is in review (spaced repetition).
   */
  async tap(
    userId: string | null,
    questionId: string,
    choice: number,
  ): Promise<TapResult> {
    const [question]: TapRow[] = await this.database.query(
      `SELECT format,options,correct_option,quick_explanation,author_id
      FROM learning_questions WHERE id = $1`,
      [questionId],
    );
    if (!question) throw new NotFoundException('Question not found');
    if (
      question.format === 'explain' ||
      !question.options ||
      question.correct_option === null
    )
      throw new BadRequestException({
        code: 'NOT_TAPPABLE',
        message: 'This question is answered by explanation',
      });
    if (choice >= question.options.length)
      throw new BadRequestException('Unknown option');
    const reveal = {
      questionId,
      correctOption: question.correct_option,
      quickExplanation: question.quick_explanation ?? '',
    };
    if (!userId) {
      return {
        ...reveal,
        choice,
        correct: choice === question.correct_option,
        xpAwarded: 0,
        review: false,
        combo: null,
        progress: null,
      };
    }

    const outcome = await this.database.transaction(async (manager) => {
      // Serialize one learner's taps so XP, combos, and review boxes stay consistent.
      await manager.query('SELECT pg_advisory_xact_lock(1103,hashtext($1))', [
        userId,
      ]);
      await manager.query(
        `INSERT INTO learning_question_progress (user_id,question_id) VALUES ($1,$2)
        ON CONFLICT (user_id,question_id) DO NOTHING`,
        [userId, questionId],
      );
      const [progress] = await manager.query(
        `SELECT xp_earned,box,needs_review,(due_at IS NOT NULL AND due_at <= now()) AS due
        FROM learning_question_progress WHERE user_id = $1 AND question_id = $2 FOR UPDATE`,
        [userId, questionId],
      );
      const [first] = await manager.query(
        `SELECT choice,correct FROM learning_taps
        WHERE user_id = $1 AND question_id = $2 AND NOT review`,
        [userId, questionId],
      );
      // A question in Practice can be retried at any time until it is answered correctly.
      const canReview = first && progress.needs_review;
      if (first && !canReview) {
        const [latest] = await manager.query(
          `SELECT choice,correct FROM learning_taps WHERE user_id = $1 AND question_id = $2
          ORDER BY created_at DESC,id DESC LIMIT 1`,
          [userId, questionId],
        );
        return {
          choice: latest.choice as number,
          correct: latest.correct as boolean,
          xp: 0,
          review: false,
        };
      }

      const correct = choice === question.correct_option;
      const xp =
        !first && correct && question.author_id !== userId
          ? Math.max(0, Math.min(TAP_XP, 20 - progress.xp_earned))
          : 0;
      await manager.query(
        `INSERT INTO learning_taps (user_id,question_id,choice,correct,review,xp_awarded,day)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          userId,
          questionId,
          choice,
          correct,
          Boolean(first),
          xp,
          learningDay(),
        ],
      );
      // A correct first tap on a never-missed question needs no review.
      const schedule = nextSchedule(progress.box, correct);
      await manager.query(
        `UPDATE learning_question_progress SET ${SCHEDULE_SQL},
        xp_earned = xp_earned + $7, updated_at = now() WHERE user_id = $1 AND question_id = $2`,
        [userId, questionId, ...scheduleParameters(schedule), xp],
      );
      return { choice, correct, xp, review: Boolean(first) };
    });

    const progress = await this.assessment.progress(userId);
    return {
      ...reveal,
      choice: outcome.choice,
      correct: outcome.correct,
      xpAwarded: outcome.xp,
      review: outcome.review,
      combo: progress.combo,
      progress,
    };
  }

  /** "Still confused? Ask Gemini" — a short tutor answer grounded in the question. */
  async followUp(
    userId: string,
    questionId: string,
    input: FollowUpDto,
  ): Promise<FollowUpResult> {
    const question = await this.questions.gradingQuestion(questionId);
    const [engaged] = await this.database.query(
      `SELECT (SELECT t.choice FROM learning_taps t WHERE t.user_id = $1 AND t.question_id = $2
          ORDER BY t.created_at DESC LIMIT 1) AS choice,
        EXISTS (SELECT 1 FROM learning_taps t WHERE t.user_id = $1 AND t.question_id = $2)
          OR EXISTS (SELECT 1 FROM learning_attempts a WHERE a.user_id = $1 AND a.question_id = $2)
          AS answered`,
      [userId, questionId],
    );
    if (!engaged.answered)
      throw new BadRequestException({
        code: 'ANSWER_FIRST',
        message: 'Answer the question before asking a follow-up',
      });
    const claim = await this.operations.claim(
      userId,
      input.requestId,
      'followup',
      { questionId, question: input.question },
      questionId,
    );
    if (claim.replay) return claim.replay as FollowUpResult;
    try {
      const choice: number | null = engaged.choice;
      const learnerChoice =
        choice === null ? null : (question.options?.[choice] ?? null);
      const { answer } = await this.gemini.answerFollowUp(
        question,
        input.question,
        learnerChoice,
      );
      return await this.database.transaction(async (manager) => {
        await this.operations.assertLease(manager, claim);
        const result: FollowUpResult = {
          id: input.requestId,
          questionId,
          question: input.question,
          answer,
          createdAt: new Date().toISOString(),
        };
        await this.operations.complete(manager, claim, result);
        return result;
      });
    } catch (error) {
      await this.operations.fail(claim);
      throw error;
    }
  }

  /** Bug of the Day: one shared tap question per language and Tokyo calendar day. */
  async daily(language: LearningLanguage, userId: string | null) {
    const day = learningDay();
    await this.database.query(
      `INSERT INTO learning_daily_challenges (day,language,question_id)
      SELECT $1::date,$2::varchar,q.id FROM learning_questions q
      WHERE q.language = $2::varchar AND q.format <> 'explain' AND q.source = 'ai' AND q.difficulty = 'beginner'
      ORDER BY (q.generated_for IS NULL) DESC,(q.format = 'spot_bug') DESC,md5(q.id::text || $3::text)
      LIMIT 1 ON CONFLICT (day,language) DO UPDATE SET question_id = EXCLUDED.question_id
      WHERE EXISTS (SELECT 1 FROM learning_questions previous
        WHERE previous.id = learning_daily_challenges.question_id AND previous.difficulty <> 'beginner')`,
      [day, language, day],
    );
    const [challenge] = await this.database.query(
      `SELECT d.question_id FROM learning_daily_challenges d
      JOIN learning_questions q ON q.id = d.question_id
      WHERE d.day = $1::date AND d.language = $2 AND q.difficulty = 'beginner'`,
      [day, language],
    );
    if (!challenge)
      return {
        day,
        question: null,
        answered: 0,
        solved: 0,
        solvers: [],
        you: null,
      };
    const questionId: string = challenge.question_id;
    const question: PublicQuestion = await this.questions.question(
      questionId,
      userId,
    );
    const [stats] = await this.database.query(
      `SELECT count(*)::int AS answered,count(*) FILTER (WHERE correct)::int AS solved
      FROM learning_taps WHERE question_id = $1 AND day = $2::date AND NOT review`,
      [questionId, day],
    );
    const solverRows = await this.database.query(
      `SELECT t.user_id,t.created_at,u.username,u.name,u.avatar_url FROM learning_taps t
      JOIN users u ON u.id = t.user_id
      WHERE t.question_id = $1 AND t.day = $2::date AND NOT t.review AND t.correct
      ORDER BY t.created_at,t.id LIMIT 10`,
      [questionId, day],
    );
    let you: { correct: boolean; rank: number | null } | null = null;
    if (userId) {
      const [mine] = await this.database.query(
        `SELECT t.correct,(SELECT count(*)::int FROM learning_taps o WHERE o.question_id = t.question_id
          AND o.day = t.day AND NOT o.review AND o.correct AND o.created_at < t.created_at) AS ahead
        FROM learning_taps t WHERE t.user_id = $1 AND t.question_id = $2 AND t.day = $3::date
        AND NOT t.review`,
        [userId, questionId, day],
      );
      if (mine)
        you = {
          correct: mine.correct,
          rank: mine.correct ? mine.ahead + 1 : null,
        };
    }
    return {
      day,
      question,
      answered: stats.answered,
      solved: stats.solved,
      solvers: solverRows.map((row, index) => ({
        rank: index + 1,
        user: author(row),
        answeredAt: new Date(row.created_at).toISOString(),
      })),
      you,
    };
  }
}

function author(row: {
  user_id: string;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
}): PublicAuthor {
  return {
    id: row.user_id,
    displayName: row.username || row.name || 'Learner',
    avatarUrl: row.avatar_url ?? null,
  };
}
