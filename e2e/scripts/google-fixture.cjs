const { generateKeyPairSync, sign } = require('node:crypto');
const nock = require('nock').default;

if (process.env.WHYLINT_E2E !== '1' || process.env.GOOGLE_CLIENT_ID !== 'whylint-fixture-client') {
  throw new Error('The Google fixture is only available in the disposable test stack');
}

// Mock Google HTTP and keep the real token verifier.
nock.disableNetConnect();
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const keyId = 'whylint-fixture-key';
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

function idToken(suffix) {
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: 'RS256', typ: 'JWT', kid: keyId });
  const payload = encode({
    iss: 'https://accounts.google.com',
    aud: process.env.GOOGLE_CLIENT_ID,
    sub: `whylint-fixture-subject-${suffix}`,
    email: `google-${suffix}@example.test`,
    email_verified: true,
    name: 'WhyLint Test Learner',
    picture: 'https://lh3.googleusercontent.com/whylint-fixture-avatar.svg',
    iat: now,
    exp: now + 3600,
  });
  const content = `${header}.${payload}`;
  return `${content}.${sign('RSA-SHA256', Buffer.from(content), privateKey).toString('base64url')}`;
}

nock('https://oauth2.googleapis.com')
  .persist()
  .post('/token')
  .reply(async (request) => {
    const data = new URLSearchParams(await request.text());
    const code = data.get('code') ?? '';
    if (
      data.get('client_id') !== 'whylint-fixture-client' ||
      data.get('client_secret') !== 'whylint-fixture-secret' ||
      data.get('redirect_uri') !== `${process.env.FRONTEND_URL}/auth/google/callback` ||
      data.get('grant_type') !== 'authorization_code' ||
      !/^whylint-fixture-[a-f0-9]{32}$/.test(code)
    ) {
      return [400, { error: 'invalid_grant' }];
    }
    return [200, { id_token: idToken(code.slice('whylint-fixture-'.length)) }];
  });

nock('https://www.googleapis.com')
  .persist()
  .get('/oauth2/v1/certs')
  .reply(
    200,
    {
      [keyId]: publicKey.export({ type: 'spki', format: 'pem' }),
    },
    { 'Cache-Control': 'public, max-age=3600' },
  );
