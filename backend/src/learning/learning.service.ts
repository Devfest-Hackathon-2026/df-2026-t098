import { learningReferences } from './learning.references';
import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { GeminiService } from './gemini/gemini.service';
import { LearningOperationsService } from './learning-operations.service';
import { QuestionsService } from './questions.service';
import { formatQuestionCode } from './question-code';
import { expandInterests, INTEREST_TOPICS } from './learning.catalog';
import { questionNovelty, selectNovelQuestions } from './question-novelty';
import type { FeedBatchDto } from './dto/learning.dto';
import type {
  CardReason,
  Difficulty,
  LearningLanguage,
  LearningPreferences,
  PublicQuestion,
} from './learning.types';

const LEVELS: Difficulty[] = ['beginner', 'intermediate', 'advanced'];

export interface Adaptation {
  difficulty: Difficulty;
  previous: Difficulty;
  change: 'up' | 'down' | null;
  weakTopics: string[];
  strongTopics: string[];
}

export interface FeedBatch {
  requestId: string;
  questions: PublicQuestion[];
  communityQuestion: PublicQuestion | null;
  reviewQuestions?: PublicQuestion[];
  adaptation?: Adaptation;
}

export interface PoolQuery {
  language: LearningLanguage;
  topics: string[];
  difficulty: Difficulty | null;
  exclude: string[];
}

@Injectable()
export class LearningService {
  constructor(
    private readonly database: DataSource,
    private readonly gemini: GeminiService,
    private readonly operations: LearningOperationsService,
    private readonly questions: QuestionsService,
  ) {}

  async preferences(
    userId: string,
  ): Promise<{ preferences: LearningPreferences | null }> {
    const [row] = await this.database.query(
      'SELECT preferences FROM learning_preferences WHERE user_id = $1',
      [userId],
    );
    return { preferences: row?.preferences ?? null };
  }

  async savePreferences(userId: string, preferences: LearningPreferences) {
    const normalized = {
      ...preferences,
      interests: [...preferences.interests].sort(),
      technologies: [...preferences.technologies].sort((a, b) =>
        a.localeCompare(b),
      ),
    };
    const [row] = await this.database.query(
      `INSERT INTO learning_preferences (user_id,preferences) VALUES ($1,$2::jsonb)
      ON CONFLICT (user_id) DO UPDATE SET preferences =
        jsonb_strip_nulls(jsonb_build_object('language',learning_preferences.preferences->'language'))
        || EXCLUDED.preferences, updated_at = now()
      RETURNING preferences`,
      [userId, JSON.stringify(normalized)],
    );
    return { preferences: row.preferences };
  }

  async setLanguage(userId: string, language: LearningLanguage) {
    const [rows] = await this.database.query(
      `UPDATE learning_preferences SET
        preferences = jsonb_set(preferences,'{language}',to_jsonb($2::text)),
        updated_at = now() WHERE user_id = $1 RETURNING preferences`,
      [userId, language],
    );
    const row = rows[0];
    if (!row) {
      throw new BadRequestException({
        code: 'PREFERENCES_REQUIRED',
        message: 'Choose your learning interests first',
      });
    }
    return { preferences: row.preferences };
  }

  async batch(userId: string, input: FeedBatchDto): Promise<FeedBatch> {
    const { preferences } = await this.preferences(userId);
    if (!preferences)
      throw new BadRequestException({
        code: 'PREFERENCES_REQUIRED',
        message: 'Choose your learning interests first',
      });
    const claim = await this.operations.claim(userId, input.requestId, 'feed', {
      language: input.language,
      preferences,
      ...(input.excludeQuestionIds?.length
        ? { excludeQuestionIds: [...input.excludeQuestionIds].sort() }
        : {}),
    });
    if (claim.replay) {
      const result = claim.replay as FeedBatch;
      return {
        ...result,
        questions: await Promise.all(
          result.questions.map((question) =>
            formatQuestionCode({
              ...question,
              references: learningReferences(question.topics),
              novelty: questionNovelty(question),
            }),
          ),
        ),
        communityQuestion: result.communityQuestion
          ? await formatQuestionCode({
              ...result.communityQuestion,
              references: learningReferences(result.communityQuestion.topics),
              novelty: questionNovelty(result.communityQuestion),
            })
          : null,
        reviewQuestions: await Promise.all(
          (result.reviewQuestions ?? []).map((question) =>
            formatQuestionCode({
              ...question,
              references: learningReferences(question.topics),
              novelty: questionNovelty(question),
            }),
          ),
        ),
      };
    }
    try {
      const adaptation = await this.adapt(userId, preferences);
      const weakTopics = adaptation.weakTopics;
      const recentQuestions = await this.questions.noveltyContext(
        input.excludeQuestionIds ?? [],
        userId,
      );
      const candidates = await this.gemini.generateQuestions(
        {
          ...preferences,
          difficulty: adaptation.difficulty,
          strongTopics: adaptation.strongTopics,
        },
        input.language,
        weakTopics,
        recentQuestions.map((question) => question.prompt),
        () => this.operations.recordFeedRetry(userId, claim),
        recentQuestions,
      );
      const generated = selectNovelQuestions(candidates, recentQuestions, 5);
      return await this.database.transaction(async (manager) => {
        await this.operations.assertLease(manager, claim);
        const ids: string[] = [];
        for (const question of generated)
          ids.push(
            await this.questions.insert(manager, question, 'ai', userId),
          );
        const generatedQuestions = await this.questions.list(
          'WHERE q.id = ANY($1::uuid[]) ORDER BY array_position($1::uuid[],q.id)',
          [ids],
          userId,
          manager,
        );
        const topUp =
          generatedQuestions.length < 5
            ? await this.questions.pool(
                {
                  language: input.language,
                  topics: [
                    ...preferences.interests,
                    ...preferences.technologies,
                  ],
                  difficulty: adaptation.difficulty,
                  exclude: [...ids, ...(input.excludeQuestionIds ?? [])],
                  limit: 5 - generatedQuestions.length,
                  previous: [...recentQuestions, ...generatedQuestions],
                },
                userId,
              )
            : [];
        const questions = [...generatedQuestions, ...topUp].map((question) => ({
          ...question,
          reason: this.reason(question, preferences, adaptation),
        }));
        const community = await this.questions.communityForFeed(
          userId,
          input.language,
          [...preferences.interests, ...preferences.technologies],
          manager,
        );
        const communityQuestion =
          community &&
          selectNovelQuestions(
            [community],
            [...recentQuestions, ...questions],
            1,
          ).length
            ? {
                ...community,
                reason: { kind: 'community' as const, topic: null },
              }
            : null;
        const reviewQuestions = await this.questions.dueReviews(
          userId,
          input.language,
          3,
          manager,
        );
        const result: FeedBatch = {
          requestId: input.requestId,
          questions,
          communityQuestion,
          reviewQuestions,
          adaptation,
        };
        await this.operations.complete(manager, claim, result);
        return result;
      });
    } catch (error) {
      await this.operations.fail(claim);
      throw error;
    }
  }

  async pool(query: PoolQuery, userId: string | null) {
    let { topics, difficulty } = query;
    if (userId && !topics.length) {
      const { preferences } = await this.preferences(userId);
      if (preferences) {
        topics = [...preferences.interests, ...preferences.technologies];
        difficulty ??= preferences.difficulty;
      }
    }
    const questions = await this.questions.pool(
      {
        language: query.language,
        topics,
        difficulty,
        exclude: query.exclude,
        limit: 5,
      },
      userId,
    );
    const context = { interests: topics, technologies: [] as string[] };
    const reviewQuestions = userId
      ? await this.questions.dueReviews(userId, query.language, 3)
      : [];
    return {
      questions: questions.map((question) => ({
        ...question,
        reason: this.reason(question, context, null),
      })),
      reviewQuestions,
    };
  }

  async adapt(
    userId: string,
    preferences: LearningPreferences,
  ): Promise<Adaptation> {
    const [latest] = await this.database.query(
      `SELECT q.difficulty FROM learning_questions q
      WHERE q.generated_for = $1 AND q.created_at > coalesce(
        (SELECT updated_at FROM learning_preferences WHERE user_id = $1), '-infinity')
      ORDER BY q.created_at DESC LIMIT 1`,
      [userId],
    );
    const previous: Difficulty = latest?.difficulty ?? preferences.difficulty;
    const recent: { correct: boolean }[] = await this.database.query(
      `SELECT t.correct FROM learning_taps t JOIN learning_questions q ON q.id = t.question_id
      WHERE t.user_id = $1 AND NOT t.review AND q.difficulty = $2
      AND t.created_at > coalesce((SELECT max(created_at) FROM learning_questions
        WHERE generated_for = $1 AND difficulty <> $2), '-infinity')
      ORDER BY t.created_at DESC LIMIT 6`,
      [userId, previous],
    );
    const correct = recent.filter((row) => row.correct).length;
    let index = LEVELS.indexOf(previous);
    if (recent.length >= 6 && correct >= 5) index = Math.min(2, index + 1);
    else if (recent.length >= 5 && correct <= 2) index = Math.max(0, index - 1);
    const difficulty = LEVELS[index];

    const topicRows: { topic: string; misses: number; streak: boolean }[] =
      await this.database.query(
        `WITH outcomes AS (
          SELECT question_id,correct,created_at FROM learning_taps WHERE user_id = $1
          UNION ALL SELECT question_id,score >= 8,created_at FROM learning_attempts WHERE user_id = $1
          ORDER BY created_at DESC LIMIT 60
        ), by_topic AS (
          SELECT topic,o.correct,row_number() OVER (PARTITION BY topic ORDER BY o.created_at DESC) AS n
          FROM outcomes o JOIN learning_questions q ON q.id = o.question_id
          CROSS JOIN LATERAL unnest(q.topics) AS topic WHERE topic <> 'general'
        )
        SELECT topic,count(*) FILTER (WHERE NOT correct)::int AS misses,count(*)::int AS total,
          (count(*) FILTER (WHERE n <= 3 AND correct) = 3) AS streak
        FROM by_topic GROUP BY topic
        ORDER BY count(*) FILTER (WHERE NOT correct)::float / count(*) DESC,misses DESC,topic`,
        [userId],
      );
    return {
      difficulty,
      previous,
      change:
        index > LEVELS.indexOf(previous)
          ? 'up'
          : index < LEVELS.indexOf(previous)
            ? 'down'
            : null,
      weakTopics: topicRows
        .filter((row) => row.misses > 0)
        .map((row) => row.topic)
        .slice(0, 10),
      strongTopics: topicRows
        .filter((row) => row.streak)
        .map((row) => row.topic)
        .slice(0, 5),
    };
  }

  private reason(
    question: PublicQuestion,
    preferences: Pick<LearningPreferences, 'interests' | 'technologies'>,
    adaptation: Adaptation | null,
  ): CardReason {
    const topics = question.topics.map((topic) => topic.toLowerCase());
    const weak = adaptation?.weakTopics.find((topic) => topics.includes(topic));
    if (weak) return { kind: 'weak', topic: weak };
    const strong = adaptation?.strongTopics.find((topic) =>
      topics.includes(topic),
    );
    if (strong) return { kind: 'challenge', topic: strong };
    const chosen = expandInterests([
      ...preferences.interests,
      ...preferences.technologies,
    ]);
    const interest =
      topics.find(
        (topic) => chosen.includes(topic) && !(topic in INTEREST_TOPICS),
      ) ?? topics.find((topic) => chosen.includes(topic));
    if (interest) return { kind: 'interest', topic: interest };
    if (topics.includes('general'))
      return {
        kind: 'general',
        topic: topics.find((t) => t !== 'general') ?? null,
      };
    return { kind: 'pool', topic: topics[0] ?? null };
  }
}
