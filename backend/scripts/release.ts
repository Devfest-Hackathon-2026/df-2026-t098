/**
 * Release job: applies pending migrations, then loads the committed question pool.
 * It runs from the compiled output, so the production image needs no ts-node:
 *   npm run build && node dist/scripts/release.js        (or: npm run release)
 * Run it once per deploy, before the new revision takes traffic. Safe to repeat.
 */
import { AppDataSource } from '../src/datasource';
import { QuestionPoolSeeder } from '../src/learning/question-pool.seeder';

async function main() {
  if (!process.env.DB_URL) throw new Error('DB_URL is not set');
  await AppDataSource.initialize();
  try {
    const applied = await AppDataSource.runMigrations({ transaction: 'all' });
    console.log(
      applied.length
        ? `Migrations applied: ${applied.map((migration) => migration.name).join(', ')}`
        : 'Migrations: database already up to date',
    );
    const changed = await new QuestionPoolSeeder(AppDataSource).seed();
    console.log(`Pool seeded: ${changed} new or updated questions`);
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  console.error(`Release failed: ${(error as Error).message}`);
  process.exit(1);
});
