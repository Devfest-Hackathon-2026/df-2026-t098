/**
 * Loads backend/seed/question-pool.json into the configured database without starting the API.
 *   npm run pool:seed
 * Safe to repeat: new questions are inserted and existing pool rows are refreshed.
 */
import { AppDataSource } from '../src/datasource';
import { QuestionPoolSeeder } from '../src/learning/question-pool.seeder';

async function main() {
  await AppDataSource.initialize();
  try {
    const changed = await new QuestionPoolSeeder(AppDataSource).seed();
    console.log(`Pool seeded: ${changed} new or updated questions`);
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
