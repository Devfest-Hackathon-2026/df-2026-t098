import { readFileSync } from 'node:fs';

export type DatabaseSsl = false | { rejectUnauthorized: boolean; ca?: string };

/**
 * TLS settings for the PostgreSQL connection, chosen by DB_SSL:
 *
 *   off (default)  no TLS. Local development, or a Unix socket such as Cloud SQL's /cloudsql/…
 *   verify         TLS, with the server certificate and host name checked. The trust anchor is
 *                  DB_SSL_CA (PEM text; "\n" escapes allowed) or DB_SSL_CA_FILE (a PEM file,
 *                  for example a mounted secret). Without either, the system CAs are used.
 *   no-verify      TLS without checking the certificate: encrypts but does not authenticate.
 *
 * Any other value throws, so a typo never silently falls back to a plaintext connection.
 */
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
