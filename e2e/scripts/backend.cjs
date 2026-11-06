const path = require('node:path');

if (process.env.WHYLINT_E2E !== '1' ||
    !/^postgresql:\/\/whylint_test@127\.0\.0\.1:\d+\/whylint_auth_e2e_browser$/.test(process.env.DB_URL ?? '')) {
  throw new Error('The browser test backend requires its own disposable database');
}

require('./google-fixture.cjs');
const backend = path.resolve(__dirname, '../../backend');
const { AppDataSource } = require(path.join(backend, 'dist/src/datasource.js'));

async function start() {
  await AppDataSource.initialize();
  try {
    await AppDataSource.runMigrations({ transaction: 'all' });
  } finally {
    await AppDataSource.destroy();
  }
  require(path.join(backend, 'dist/src/main.js'));
}

start().catch(() => {
  console.error('Disposable backend initialization failed; inspect the fixture-only backend log.');
  process.exitCode = 1;
});
