import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { GeminiService } from './gemini/gemini.service';
import { LearningOperationsService } from './learning-operations.service';
import { QuestionsService } from './questions.service';
import {
  currentStreak,
  learningDay,
  learningWeek,
  LEARNING_TIMEZONE,
  longestStreak,
} from './learning-calendar';
import type { AssessmentResult } from './learning.types';
import { INTERESTS } from './learning.catalog';
import {
  nextSchedule,
  RESOLVED,
  scheduleParameters,
  SCHEDULE_SQL,
} from './learning-schedule';
import type { AttemptDto } from './dto/learning.dto';

@Injectable()
export class AssessmentService {
  constructor(
    private readonly database: DataSource,
    private readonly gemini: GeminiService,
    private readonly operations: LearningOperationsService,
    private readonly questions: QuestionsService,
  ) {}

  async assess(
    userId: string,
    questionId: string,
    input: AttemptDto,
  ): Promise<AssessmentResult> {
    const question = await this.questions.gradingQuestion(questionId);
    const claim = await this.operations.claim(
      userId,
      input.requestId,
      'attempt',
      { questionId, answer: input.answer },
      questionId,
    );
    if (claim.replay) return claim.replay as AssessmentResult;
    try {
      const grade = await this.gemini.assessAnswer(question, input.answer);
      return await this.database.transaction(async (manager) => {
        await this.operations.assertLease(manager, claim);
        await manager.query(
          `INSERT INTO learning_question_progress (user_id,question_id) VALUES ($1,$2)
          ON CONFLICT (user_id,question_id) DO NOTHING`,
          [userId, questionId],
        );
        const [progress] = await manager.query(
          `SELECT * FROM learning_question_progress
          WHERE user_id = $1 AND question_id = $2 FOR UPDATE`,
          [userId, questionId],
        );
        const passed = grade.score >= 8;
        const targetXp = passed || progress.passed ? 20 : 5;
        const xpAwarded =
          question.authorId === userId
            ? 0
            : Math.max(0, targetXp - progress.xp_earned);
        const [attempt] = await manager.query(
          `INSERT INTO learning_attempts
          (id,user_id,question_id,answer,score,feedback,improvements,explanation,xp_awarded,day)
          VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10) RETURNING created_at`,
          [
            input.requestId,
            userId,
            questionId,
            input.answer,
            grade.score,
            grade.feedback,
            JSON.stringify(grade.improvements),
            grade.explanation,
            xpAwarded,
            learningDay(),
          ],
        );
        const schedule = passed ? RESOLVED : nextSchedule(progress.box, false);
        await manager.query(
          `UPDATE learning_question_progress SET ${SCHEDULE_SQL}, attempt_count = attempt_count + 1,
          last_score = $7, passed = passed OR $8, xp_earned = xp_earned + $9, updated_at = now()
          WHERE user_id = $1 AND question_id = $2`,
          [
            userId,
            questionId,
            ...scheduleParameters(schedule),
            grade.score,
            passed,
            xpAwarded,
          ],
        );
        const result: AssessmentResult = {
          id: input.requestId,
          questionId,
          ...grade,
          passed,
          xpAwarded,
          createdAt: new Date(attempt.created_at).toISOString(),
        };
        await this.operations.complete(manager, claim, result);
        return result;
      });
    } catch (error) {
      await this.operations.fail(claim);
      throw error;
    }
  }

  async progress(userId: string) {
    const [summary] = await this.database.query(
      `SELECT coalesce(sum(xp_earned),0)::int AS total_xp,
      count(*) FILTER (WHERE passed)::int AS passed_questions
      FROM learning_question_progress p JOIN learning_questions q ON q.id = p.question_id
      WHERE p.user_id = $1 AND q.author_id IS DISTINCT FROM $1::uuid`,
      [userId],
    );
    const dayRows = await this.database.query(
      `SELECT x.day::text AS day,count(DISTINCT x.question_id)::int AS completed FROM (
        SELECT day,question_id FROM learning_attempts WHERE user_id = $1
        UNION ALL SELECT day,question_id FROM learning_taps WHERE user_id = $1) x
      JOIN learning_questions q ON q.id = x.question_id
      WHERE q.author_id IS DISTINCT FROM $1::uuid GROUP BY x.day`,
      [userId],
    );
    const [taps] = await this.database.query(
      `SELECT count(*) FILTER (WHERE correct)::int AS correct,count(*)::int AS answered
      FROM learning_taps WHERE user_id = $1 AND NOT review`,
      [userId],
    );
    const tapRows: { correct: boolean }[] = await this.database.query(
      'SELECT correct FROM learning_taps WHERE user_id = $1 ORDER BY created_at DESC LIMIT 2000',
      [userId],
    );
    const [extras] = await this.database.query(
      `SELECT EXISTS (SELECT 1 FROM learning_questions WHERE author_id = $1 AND source = 'community')
        AS posted,
      EXISTS (SELECT 1 FROM learning_daily_challenges d JOIN learning_taps t
        ON t.question_id = d.question_id AND t.day = d.day
        WHERE t.user_id = $1 AND t.correct AND NOT t.review) AS daily_solved`,
      [userId],
    );
    const interestIds = INTERESTS.map((interest) => interest.id);
    const topics = await this.topicMastery(userId, {
      exclude: ['general', ...interestIds],
    });
    const interestRows = await this.topicMastery(userId, { only: interestIds });
    const [highlight] = await this.topicMastery(userId, {
      since: learningWeek(),
      exclude: ['general', ...interestIds],
    });
    const days = new Set<string>(dayRows.map((row) => row.day));
    const dailyCompleted =
      dayRows.find((row) => row.day === learningDay())?.completed ?? 0;
    const outcomes = tapRows.map((row) => row.correct);
    const combo = outcomes.findIndex((correct) => !correct);
    const bestCombo = longestRun(outcomes);
    const longest = longestStreak(days);
    return {
      totalXp: summary.total_xp,
      level: 1 + Math.floor(summary.total_xp / 100),
      streak: currentStreak(days),
      passedQuestions: summary.passed_questions,
      correctTaps: taps.correct,
      answeredTaps: taps.answered,
      combo: combo === -1 ? outcomes.length : combo,
      bestCombo,
      dailyGoal: 5,
      dailyCompleted,
      timezone: LEARNING_TIMEZONE,
      topics,
      interests: interestIds.map(
        (id) =>
          interestRows.find((row) => row.topic === id) ?? {
            topic: id,
            answered: 0,
            correct: 0,
            mastery: 0,
          },
      ),
      weeklyHighlight: highlight?.correct
        ? { topic: highlight.topic, correct: highlight.correct }
        : null,
      achievements: [
        { id: 'first-correct-tap', earned: taps.correct >= 1 },
        { id: 'first-pass', earned: summary.passed_questions >= 1 },
        { id: 'combo-five', earned: bestCombo >= 5 },
        { id: 'combo-ten', earned: bestCombo >= 10 },
        { id: 'ten-passes', earned: summary.passed_questions >= 10 },
        { id: 'fifty-correct', earned: taps.correct >= 50 },
        { id: 'three-day-streak', earned: longest >= 3 },
        { id: 'seven-day-streak', earned: longest >= 7 },
        { id: 'daily-solver', earned: Boolean(extras.daily_solved) },
        { id: 'first-post', earned: Boolean(extras.posted) },
      ],
    };
  }

  /** Per-topic accuracy from first taps and explanations. Mastery = share answered correctly. */
  async topicMastery(
    userId: string,
    filter: { since?: string; only?: string[]; exclude?: string[] } = {},
  ) {
    const { since } = filter;
    const rows: { topic: string; answered: number; correct: number }[] =
      await this.database.query(
        `WITH outcomes AS (
        SELECT question_id,bool_or(correct) AS correct FROM (
          SELECT question_id,correct,day FROM learning_taps WHERE user_id = $1 AND NOT review
          UNION ALL SELECT question_id,score >= 8,day FROM learning_attempts WHERE user_id = $1
        ) x WHERE $2::date IS NULL OR x.day >= $2::date GROUP BY question_id
      )
      SELECT topic,count(*)::int AS answered,count(*) FILTER (WHERE o.correct)::int AS correct
      FROM outcomes o JOIN learning_questions q ON q.id = o.question_id
      CROSS JOIN LATERAL unnest(q.topics) AS topic
      WHERE q.author_id IS DISTINCT FROM $1::uuid
        AND ($3::text[] IS NULL OR topic = ANY($3::text[]))
        AND NOT (topic = ANY($4::text[]))
      GROUP BY topic ORDER BY ${since ? 'correct DESC,answered DESC' : 'answered DESC,correct DESC'},topic
      LIMIT 8`,
        [userId, since ?? null, filter.only ?? null, filter.exclude ?? []],
      );
    return rows.map((row) => ({
      topic: row.topic,
      answered: row.answered,
      correct: row.correct,
      mastery: row.answered
        ? Math.round((row.correct / row.answered) * 100) / 100
        : 0,
    }));
  }

  async leaderboard() {
    const weekStart = learningWeek();
    const rows = await this.database.query(
      `SELECT u.id,u.username,u.name,u.avatar_url,sum(x.xp_awarded)::int AS xp FROM (
        SELECT user_id,xp_awarded,day FROM learning_attempts
        WHERE day >= $1::date AND day < $1::date + 7 AND xp_awarded > 0
        UNION ALL SELECT user_id,xp_awarded,day FROM learning_taps
        WHERE day >= $1::date AND day < $1::date + 7 AND xp_awarded > 0
      ) x JOIN users u ON u.id = x.user_id
      GROUP BY u.id ORDER BY xp DESC,u.id LIMIT 50`,
      [weekStart],
    );
    let rank = 0;
    let previousXp: number | undefined;
    return {
      weekStart,
      timezone: LEARNING_TIMEZONE,
      entries: rows.map((row, index) => {
        if (row.xp !== previousXp) rank = index + 1;
        previousXp = row.xp;
        return {
          rank,
          user: {
            id: row.id,
            displayName: row.username || row.name || 'Learner',
            avatarUrl: row.avatar_url ?? null,
          },
          xp: row.xp,
        };
      }),
    };
  }
}

function longestRun(outcomes: boolean[]): number {
  let longest = 0;
  let run = 0;
  for (const correct of outcomes) {
    run = correct ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return longest;
}
