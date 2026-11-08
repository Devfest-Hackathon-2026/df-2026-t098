import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { databaseSsl } from './database-ssl';

const PEM = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n';

describe('databaseSsl', () => {
  it('stays off unless configured, so local databases and sockets keep working', () => {
    expect(databaseSsl({})).toBe(false);
    expect(databaseSsl({ DB_SSL: '' })).toBe(false);
    expect(databaseSsl({ DB_SSL: ' OFF ' })).toBe(false);
  });

  it('verifies the server certificate by default when TLS is on', () => {
    expect(databaseSsl({ DB_SSL: 'verify' })).toEqual({
      rejectUnauthorized: true,
    });
  });

  it('trusts an inline CA, expanding escaped newlines from single-line secrets', () => {
    const single = PEM.trim().replace(/\n/g, '\\n');
    expect(databaseSsl({ DB_SSL: 'verify', DB_SSL_CA: single })).toEqual({
      rejectUnauthorized: true,
      ca: PEM.trim(),
    });
  });

  it('trusts a CA read from a mounted file', () => {
    const directory = mkdtempSync(join(tmpdir(), 'whylint-ca-'));
    try {
      const file = join(directory, 'server-ca.pem');
      writeFileSync(file, PEM);
      expect(databaseSsl({ DB_SSL: 'verify', DB_SSL_CA_FILE: file })).toEqual({
        rejectUnauthorized: true,
        ca: PEM,
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('prefers the inline CA over the file', () => {
    expect(
      databaseSsl({
        DB_SSL: 'verify',
        DB_SSL_CA: PEM,
        DB_SSL_CA_FILE: '/does/not/exist.pem',
      }),
    ).toMatchObject({ ca: PEM.trim() });
  });

  it('fails closed when the CA file is missing', () => {
    expect(() =>
      databaseSsl({ DB_SSL: 'verify', DB_SSL_CA_FILE: '/does/not/exist.pem' }),
    ).toThrow('DB_SSL_CA_FILE could not be read');
  });

  it('allows encryption without verification only when asked by name', () => {
    expect(databaseSsl({ DB_SSL: 'no-verify' })).toEqual({
      rejectUnauthorized: false,
    });
  });

  it('rejects unknown values instead of silently connecting in plaintext', () => {
    expect(() => databaseSsl({ DB_SSL: 'require' })).toThrow('DB_SSL must be');
    expect(() => databaseSsl({ DB_SSL: 'true' })).toThrow('DB_SSL must be');
    expect(() => databaseSsl({ DB_SSL: 'verfiy' })).toThrow('DB_SSL must be');
  });
});
