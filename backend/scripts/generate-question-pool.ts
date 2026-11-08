/**
 * Generates the committed tap-question pool with the real Gemini configuration.
 *   npm run pool:generate            # all interests × difficulties × languages
 *   npm run pool:generate -- --rounds 2
 * Requires GEMINI_API_KEY and GEMINI_MODEL in backend/.env. Never runs in production.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GeminiService } from '../src/learning/gemini/gemini.service';
import type {
  GeneratedQuestion,
  LearningLanguage,
} from '../src/learning/gemini/gemini.types';

const OUTPUT = join(__dirname, '..', 'seed', 'question-pool.json');
const TECHNOLOGIES: Record<string, string[]> = {
  frontend: ['JavaScript', 'TypeScript', 'React', 'CSS'],
  backend: ['Node.js', 'Python', 'Go', 'REST APIs'],
  database: ['PostgreSQL', 'SQL', 'Redis'],
  security: ['JWT', 'OAuth', 'Web security'],
  networking: ['HTTP', 'TCP/IP', 'DNS'],
  cloud: ['Docker', 'Kubernetes', 'CI/CD'],
};
const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
const LANGUAGES: LearningLanguage[] = ['ja', 'en'];

type PoolQuestion = GeneratedQuestion & { id: string };

async function main() {
  const rounds =
    Number(process.argv[process.argv.indexOf('--rounds') + 1]) || 1;
  const gemini = new GeminiService();
  const existing: PoolQuestion[] = existsSync(OUTPUT)
    ? JSON.parse(readFileSync(OUTPUT, 'utf8')).questions
    : [];
  const pool = [...existing];
  const jobs = Array.from({ length: rounds }).flatMap(() =>
    LANGUAGES.flatMap((language) =>
      Object.keys(TECHNOLOGIES).flatMap((interest) =>
        DIFFICULTIES.map((difficulty) => ({ language, interest, difficulty })),
      ),
    ),
  );
  let done = 0;
  let failed = 0;
  const worker = async () => {
    for (let job = jobs.shift(); job; job = jobs.shift()) {
      const recent = pool
        .filter((question) => question.language === job.language)
        .slice(-30)
        .map((question) => question.prompt);
      try {
        const questions = await gemini.generateQuestions(
          {
            interests: [job.interest],
            technologies: TECHNOLOGIES[job.interest],
            difficulty: job.difficulty,
          },
          job.language,
          [],
          recent,
        );
        pool.push(
          ...questions.map((question) => ({ id: randomUUID(), ...question })),
        );
        done++;
      } catch (error) {
        failed++;
        const response = (
          error as { response?: { reason?: string; code?: string } }
        ).response;
        console.warn(
          `skip ${job.language}/${job.interest}/${job.difficulty}:`,
          response?.reason ?? response?.code ?? (error as Error).message,
        );
      }
      save(pool);
      console.log(`${done} ok, ${failed} failed, ${pool.length} questions`);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
}

function save(questions: PoolQuestion[]) {
  mkdirSync(join(OUTPUT, '..'), { recursive: true });
  writeFileSync(
    OUTPUT,
    JSON.stringify({ version: 1, questions }, null, 2) + '\n',
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
