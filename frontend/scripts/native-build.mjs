#!/usr/bin/env node
/**
 * Builds the Angular app for the Capacitor shell and copies it into the iOS/Android projects.
 *
 *   WHYLINT_API_URL=https://learn.example.com npm run native:build
 *   npm run native:build:dev                      (http://localhost:3000, or WHYLINT_API_URL)
 *
 * The native app loads its files from capacitor://localhost (iOS) or https://localhost (Android), so
 * it cannot call a relative /api. The API origin is baked into the bundle here. The backend must list
 * the app's origins in NATIVE_APP_ORIGINS (see docs/mobile.md).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const dev = args.has('--dev');
const sync = !args.has('--no-sync');

export function apiOrigin(value, { allowHttp }) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('WHYLINT_API_URL must be a URL such as https://learn.example.com');
  }
  if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:'))
    throw new Error(
      allowHttp
        ? 'WHYLINT_API_URL must start with http:// or https://'
        : 'WHYLINT_API_URL must start with https:// (use --dev for a local http server)',
    );
  if (url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname))
    throw new Error(
      'WHYLINT_API_URL must be only an origin, for example https://learn.example.com',
    );
  return url.origin;
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const configured = process.env.WHYLINT_API_URL || (dev ? 'http://localhost:3000' : '');
  if (!configured) {
    console.error('Set WHYLINT_API_URL to the API origin, for example https://learn.example.com');
    process.exit(1);
  }
  let origin;
  try {
    origin = apiOrigin(configured, { allowHttp: dev });
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  console.log(`Building the native bundle for API ${origin}${dev ? ' (development build)' : ''}`);
  const clientIdFile = path.join(root, '.env.ios-client-id');
  const iosClientId = existsSync(clientIdFile) ? readFileSync(clientIdFile, 'utf8').trim() : '';
  if (iosClientId && !/^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(iosClientId)) {
    throw new Error('The iOS Google client ID has an invalid format');
  }
  const scheme = iosClientId
    ? iosClientId.split('.').reverse().join('.')
    : 'whylint-google-unconfigured';
  writeFileSync(
    path.join(root, 'ios', 'google-signin.local.xcconfig'),
    `WHYLINT_IOS_GOOGLE_URL_SCHEME = ${scheme}\n`,
    { mode: 0o600 },
  );
  run('npx', [
    'ng',
    'build',
    '--configuration',
    dev ? 'development,native' : 'production,native',
    '--define',
    `__API_BASE_URL__=${JSON.stringify(origin)}`,
    '--define',
    `__IOS_GOOGLE_CLIENT_ID__=${JSON.stringify(iosClientId)}`,
  ]);
  if (sync) run('npx', ['cap', 'sync']);
}
