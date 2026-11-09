import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import type { GeneratedQuestion } from './gemini/gemini.types';
import { withInterestTags } from './learning.catalog';

export interface PoolFile {
  version: 1;
  questions: (GeneratedQuestion & { id: string })[];
}

const POOL_PATHS = [
  join(process.cwd(), 'seed', 'question-pool.json'),
  join(__dirname, '..', '..', 'seed', 'question-pool.json'),
  join(__dirname, '..', '..', '..', 'seed', 'question-pool.json'),
];

export function readPoolFile(): PoolFile | null {
  const path = POOL_PATHS.find((candidate) => existsSync(candidate));
  if (!path) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as PoolFile;
}

@Injectable()
export class QuestionPoolSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(QuestionPoolSeeder.name);

  constructor(private readonly database: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.LEARNING_POOL_SEED === 'off') return;
    try {
      const inserted = await this.seed();
      if (inserted)
        this.logger.log(`Loaded ${inserted} new or updated pool questions`);
    } catch (error) {
      // Leave the API up so the feed can fall back to generated questions.
      this.logger.warn(`Question pool not loaded: ${(error as Error).message}`);
    }
  }

  async seed(pool = readPoolFile()): Promise<number> {
    if (!pool?.questions.length) return 0;
    const rows = pool.questions.map((question) => ({
      ...question,
      topics: withInterestTags(question.topics),
    }));
    const result: { inserted: boolean }[] = await this.database.query(
      `INSERT INTO learning_questions (id,title,prompt,code,code_language,topics,difficulty,language,
        source,reference_answer,rubric,format,options,correct_option,quick_explanation,concept)
      SELECT x.id,x.title,x.prompt,x.code,x."codeLanguage",
        ARRAY(SELECT jsonb_array_elements_text(x.topics)),x.difficulty,x.language,'ai',
        x."referenceAnswer",x.rubric,x.format,x.options,x."correctOption",x."quickExplanation",
        x.concept
      FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,title text,prompt text,code text,
        "codeLanguage" text,topics jsonb,difficulty text,language text,"referenceAnswer" text,
        rubric jsonb,format text,options jsonb,"correctOption" int,"quickExplanation" text,
        concept text)
      ON CONFLICT (id) DO UPDATE SET topics = EXCLUDED.topics,format = EXCLUDED.format,
        options = EXCLUDED.options,correct_option = EXCLUDED.correct_option,
        quick_explanation = EXCLUDED.quick_explanation,concept = EXCLUDED.concept
      WHERE learning_questions.generated_for IS NULL AND learning_questions.source = 'ai'
        AND (learning_questions.topics,learning_questions.options,learning_questions.correct_option,
          learning_questions.concept)
          IS DISTINCT FROM (EXCLUDED.topics,EXCLUDED.options,EXCLUDED.correct_option,EXCLUDED.concept)
      RETURNING (xmax = 0) AS inserted`,
      [JSON.stringify(rows)],
    );
    return result.length;
  }
}
