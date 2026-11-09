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
