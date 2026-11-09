import { readFileSync } from 'node:fs';

export type DatabaseSsl = false | { rejectUnauthorized: boolean; ca?: string };

export function databaseSsl(env: NodeJS.ProcessEnv = process.env): DatabaseSsl {
  const mode = (env.DB_SSL ?? '').trim().toLowerCase();
  if (mode === '' || mode === 'off') return false;
  if (mode === 'no-verify') return { rejectUnauthorized: false };
  if (mode === 'verify') {
    const ca = trustedCertificate(env);
    return ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
  }
  throw new Error('DB_SSL must be off, verify or no-verify');
}

function trustedCertificate(env: NodeJS.ProcessEnv): string | undefined {
  const inline = env.DB_SSL_CA?.trim();
  if (inline) return inline.replace(/\\n/g, '\n');
  const file = env.DB_SSL_CA_FILE?.trim();
  if (!file) return undefined;
  try {
    return readFileSync(file, 'utf8');
  } catch {
    throw new Error('DB_SSL_CA_FILE could not be read');
  }
}
