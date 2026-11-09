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
