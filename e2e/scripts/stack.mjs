import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createWriteStream, existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backend = path.resolve(directory, '../backend');
const separateFrontend = path.resolve(directory, '../../hackathon-frontend-login/frontend');
const frontend = process.env.WHYLINT_FRONTEND_DIR
  ? path.resolve(process.env.WHYLINT_FRONTEND_DIR)
  : existsSync(path.join(separateFrontend, 'src/app/auth/auth-session.ts'))
    ? separateFrontend : path.resolve(directory, '../frontend');
const backendTests = process.argv.includes('--backend-tests');
const backendPort = Number(process.env.WHYLINT_E2E_BACKEND_PORT ?? 3101);
const children = [];
let runtime;
let postgresStarted = false;
let cleanupPromise;
let environment;

function startChild(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: directory,
    env: environment ?? process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
    ...options,
  });
  children.push(child);
  child.on('error', () => {});
  return child;
}

async function run(command, args, options = {}) {
  const child = startChild(command, args, options);
  let output = '';
  child.stdout?.on('data', (chunk) => { output += chunk; });
  child.stderr?.on('data', (chunk) => { output += chunk; });
  if (options.visible) {
    child.stdout?.pipe(process.stdout);
    child.stderr?.pipe(process.stderr);
  }
  const [code] = await once(child, 'close');
  if (code !== 0) {
    // Do not echo arguments or captured application output: they may contain cookies.
    const missing = output.includes('not found') || code === -2;
    throw new Error(`${path.basename(command)} failed${missing ? ' (check prerequisites and PATH)' : ''}`);
  }
}

async function listen(port, host) {
  const server = createServer();
  server.listen({ host, port });
  await once(server, 'listening');
  const address = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function assertPortFree(port) {
  try {
    await listen(port, '127.0.0.1');
    await listen(port, '::1');
  } catch {
    throw new Error(`Port ${port} is already in use or unavailable. Stop your test server before starting a fresh stack.`);
  }
}

async function waitFor(url, child) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error('A test server exited before becoming ready');
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (response.status === 200 || response.status === 401) return;
    } catch { /* Retry only while the owned process is alive. */ }
    await delay(200);
  }
  throw new Error('A test server did not become ready within two minutes');
}

function startLogged(command, args, name, options = {}) {
  const child = startChild(command, args, options);
  const log = createWriteStream(path.join(runtime, `${name}.log`), { mode: 0o600 });
  child.stdout?.pipe(log, { end: false });
  child.stderr?.pipe(log, { end: false });
  child.once('close', () => log.end());
  return child;
}

async function stopChild(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  const signal = (name) => {
    try {
      if (process.platform === 'win32') child.kill(name);
      else process.kill(-child.pid, name);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  };
  signal('SIGTERM');
  await Promise.race([once(child, 'close'), delay(3000)]);
  if (child.exitCode === null && child.signalCode === null) {
    signal('SIGKILL');
    await once(child, 'close');
  }
}

function cleanup() {
  cleanupPromise ??= (async () => {
    for (const child of [...children].reverse()) await stopChild(child);
    if (postgresStarted) {
      await run('pg_ctl', ['-D', path.join(runtime, 'postgres'), '-m', 'immediate', '-w', 'stop']);
      postgresStarted = false;
    }
    if (runtime) await rm(runtime, { recursive: true, force: true });
    console.log('Disposable WhyLint test stack stopped and removed.');
  })();
  return cleanupPromise;
}

for (const name of ['SIGINT', 'SIGTERM']) {
  process.on(name, () => {
    void cleanup().then(() => process.exit(0)).catch(() => {
      console.error(`Test cleanup failed; inspect the owned temporary directory: ${runtime}`);
      process.exit(1);
    });
  });
}

async function main() {
  if (!Number.isInteger(backendPort) || backendPort < 1024 || backendPort > 65535 || backendPort === 4200 || backendPort === 3000) {
    throw new Error('Choose a dedicated WHYLINT_E2E_BACKEND_PORT (1024–65535, excluding 3000 and 4200)');
  }
  if (!backendTests) {
    if (!existsSync(path.join(frontend, 'src/app/auth/auth-session.ts'))) {
      throw new Error('Set WHYLINT_FRONTEND_DIR to the Angular checkout containing the auth integration');
    }
    await assertPortFree(4200);
    await assertPortFree(backendPort);
  }

  runtime = await mkdtemp(path.join(tmpdir(), 'whylint-browser-'));
  const postgresPort = await listen(0, '127.0.0.1');
  const databaseName = backendTests ? 'whylint_auth_e2e_integration' : 'whylint_auth_e2e_browser';
  const databaseUrl = `postgresql://whylint_test@127.0.0.1:${postgresPort}/${databaseName}`;
  const emptyEnvironment = path.join(runtime, 'empty.env');
  await writeFile(emptyEnvironment, '', { mode: 0o600 });
  environment = {
    ...process.env,
    NODE_ENV: 'test',
    NODE_OPTIONS: '',
    DOTENV_CONFIG_PATH: emptyEnvironment,
    DOTENV_CONFIG_QUIET: 'true',
    DB_URL: databaseUrl,
    TEST_DATABASE_URL: databaseUrl,
    JWT_SECRET: 'whylint-browser-fixture-jwt-secret-never-for-deployment',
    GOOGLE_CLIENT_ID: 'whylint-fixture-client',
    GOOGLE_CLIENT_SECRET: 'whylint-fixture-secret',
    FRONTEND_URL: 'http://localhost:4200',
    PORT: String(backendPort),
    WHYLINT_E2E: '1',
    PGCONNECT_TIMEOUT: '5',
    PGPASSWORD: '',
    PGPASSFILE: emptyEnvironment,
  };
  // libpq interprets even an empty PGSERVICE as a named-service request.
  for (const key of Object.keys(environment)) {
    if (key.startsWith('PG') && !['PGCONNECT_TIMEOUT', 'PGPASSWORD', 'PGPASSFILE'].includes(key)) delete environment[key];
  }

  await run('initdb', ['-D', path.join(runtime, 'postgres'), '-U', 'whylint_test', '--auth=trust', '--encoding=UTF8', '--locale=C', '--no-instructions']);
  await run('pg_ctl', ['-D', path.join(runtime, 'postgres'), '-l', path.join(runtime, 'postgres.log'),
    '-o', `-h 127.0.0.1 -p ${postgresPort} -k ${runtime} -F`, '-w', 'start']);
  postgresStarted = true;
  await run('psql', ['--no-psqlrc', '-h', '127.0.0.1', '-p', String(postgresPort), '-U', 'whylint_test', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-c', `CREATE DATABASE ${databaseName}`]);

  if (backendTests) {
    await run('npm', ['run', 'test:e2e', '--', '--runInBand'], { cwd: backend, visible: true });
    await cleanup();
    return;
  }

  await run('npm', ['run', 'build'], { cwd: backend, visible: true });
  const api = startLogged(process.execPath, [path.join(directory, 'scripts/backend.cjs')], 'backend', { cwd: backend });
  await waitFor(`http://127.0.0.1:${backendPort}/api/v1/auth/me`, api);

  const proxy = path.join(runtime, 'proxy.json');
  await writeFile(proxy, JSON.stringify({ '/api/**': { target: `http://127.0.0.1:${backendPort}`, secure: false } }));
  const web = startLogged(process.execPath, [path.join(frontend, 'node_modules/@angular/cli/bin/ng.js'),
    'serve', '--host', 'localhost', '--port', '4200', '--proxy-config', proxy], 'frontend', {
    cwd: frontend, env: { ...environment, PORT: '4200' },
  });
  await waitFor('http://localhost:4200/login', web);
  console.log(`WhyLint test stack ready at http://localhost:4200 (backend ${backendPort}; disposable PostgreSQL; Google isolated).`);
  console.log(`Fixture-only server logs: ${runtime}`);
  for (const child of [api, web]) child.once('close', () => {
    if (!cleanupPromise) {
      console.error('An owned test server stopped unexpectedly.');
      void cleanup().finally(() => process.exit(1));
    }
  });
}

main().catch(async (error) => {
  console.error(error.message);
  if (runtime) {
    const diagnostics = path.join(directory, 'test-results/stack');
    await mkdir(diagnostics, { recursive: true });
    for (const name of ['backend', 'frontend', 'postgres']) {
      const source = path.join(runtime, `${name}.log`);
      if (existsSync(source)) await copyFile(source, path.join(diagnostics, `${name}.log`));
    }
    console.error(`Fixture-only diagnostics saved to ${diagnostics}`);
  }
  try { await cleanup(); } catch { console.error('Cleanup failed; the owned temporary directory was retained.'); }
  process.exitCode = 1;
});
