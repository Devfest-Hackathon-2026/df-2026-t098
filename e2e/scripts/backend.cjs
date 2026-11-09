const path = require('node:path');

if (
  process.env.WHYLINT_E2E !== '1' ||
  !/^postgresql:\/\/whylint_test@127\.0\.0\.1:\d+\/whylint_auth_e2e_browser$/.test(
    process.env.DB_URL ?? '',
  )
) {
  throw new Error('The browser test backend requires its own disposable database');
}

require('./google-fixture.cjs');
require('./gemini-fixture.cjs');
const { seedLearningAccounts } = require('./learning-accounts.cjs');
const backend = path.resolve(__dirname, '../../backend');
const { AppDataSource } = require(path.join(backend, 'dist/src/datasource.js'));

function installBrowserActorTracking() {
  const { NestFactory } = require(require.resolve('@nestjs/core', { paths: [backend] }));
  const create = NestFactory.create.bind(NestFactory);
  const actors = new Map();
  const actorId = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const loopback = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

  NestFactory.create = async (...args) => {
    const app = await create(...args);
    app.use((request, _response, next) => {
      const actor = request.headers['x-whylint-testactor'];
      if (
        loopback.has(request.socket.remoteAddress) &&
        typeof actor === 'string' &&
        actorId.test(actor)
      ) {
        const key = actor.toLowerCase();
        if (!actors.has(key)) {
          const index = actors.size + 1;
          if (index > 65_535) return next(new Error('Browser actor capacity exceeded'));
          actors.set(key, `127.1.${Math.floor(index / 256)}.${index % 256}`);
        }
        Object.defineProperty(request, 'ip', { configurable: true, value: actors.get(key) });
      }
      next();
    });
    return app;
  };
}

async function start() {
  await AppDataSource.initialize();
  try {
    await AppDataSource.runMigrations({ transaction: 'all' });
    await seedLearningAccounts(AppDataSource);
  } finally {
    await AppDataSource.destroy();
  }
  installBrowserActorTracking();
  require(path.join(backend, 'dist/src/main.js'));
}

start().catch(() => {
  console.error('Disposable backend initialization failed; inspect the fixture-only backend log.');
  process.exitCode = 1;
});
