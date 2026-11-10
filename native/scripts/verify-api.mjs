import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const base = new URL(process.env.WHYLINT_NATIVE_TEST_API_URL || 'http://127.0.0.1:3130');
assert(['127.0.0.1', 'localhost'].includes(base.hostname), 'Use a disposable loopback API');
assert(!['', '3000', '4200', '80', '443'].includes(base.port), 'Use a dedicated test port');
const id = randomUUID().replaceAll('-', '').slice(0, 10);
let token;
let passed = 0;
async function call(path, method = 'GET', body, status = 200, session = token, headers = {}) {
  const response = await fetch(new URL(`/api/v1/${path}`, base), {
    method, redirect: 'error', signal: AbortSignal.timeout(80_000),
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(session ? { Authorization: `Bearer ${session}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  assert.equal(response.status, status, `${method} ${path}`);
  const cookie = response.headers.get('set-cookie');
  if (path === 'auth/logout' && cookie) assert.match(cookie, /^access_token=;/);
  else assert.equal(cookie, null, 'Native flow must not create cookies');
  passed++;
  return response.status === 204 ? null : response.json();
}

const pool = await call('learning/feed/pool?language=ja');
assert(pool.questions.length > 0, 'Seeded guest feed should load');
const question = pool.questions.find(q => q.format !== 'explain');
assert(question, 'Expected a tappable seed question');
const guest = await call(`learning/questions/${question.id}/taps`, 'POST', { choice: 0 });
assert.equal(guest.xpAwarded, 0, 'Guest cannot earn account XP');
const account = { email: `native-${id}@example.test`, username: `native_${id}`, password: 'fixture-only-native-password' };
const signup = await call('auth/mobile/signup', 'POST', account, 201);
assert.equal(typeof signup.token, 'string');
token = signup.token;
const me = await call('auth/me');
assert.equal(me.email, account.email);
// Answers given as a guest before signing up count towards the new account.
const guestQuestion = pool.questions.filter(q => q.format !== 'explain' && q.id !== question.id)[0];
assert(guestQuestion, 'Expected a second seeded quiz question');
const imported = await call('learning/guest-answers', 'POST', {
  accountId: me.id, requestId: randomUUID(), answers: [{ questionId: guestQuestion.id, choice: 0 }],
});
assert.equal(imported.imported, 1, 'The guest answer must be imported');
assert.equal(imported.skipped, 0);
assert.equal(typeof imported.progress?.level, 'number', 'The import answers with the new progress');
await call('learning/preferences', 'PUT', {
  interests: ['backend'], technologies: ['TypeScript'], difficulty: 'beginner', language: 'ja',
});
await call('learning/preferences/language', 'PATCH', { language: 'en' });
const preferences = await call('learning/preferences');
assert.equal(preferences.preferences.language, 'en');
await call(`learning/questions/${question.id}/taps`, 'POST', { choice: 0 });
await call(`learning/questions/${question.id}/save`, 'PUT', { saved: true });
const saved = await call('learning/saved');
assert(saved.questions.some(q => q.id === question.id));
await call(`learning/questions/${question.id}/like`, 'PUT', { liked: true });
await call(`learning/questions/${question.id}/comments`, 'POST', { text: 'Native client integration check.' }, 201);
await call(`learning/questions/${question.id}/comments`);
const batch = await call('learning/feed/batches', 'POST', {
  requestId: randomUUID(), language: 'en', excludeQuestionIds: [question.id],
});
assert.equal(batch.questions.length, 5);
const assessment = await call(`learning/questions/${question.id}/attempts`, 'POST', {
  requestId: randomUUID(), answer: 'The server validates the signature and checks expiry before trusting the token.',
});
assert.equal(typeof assessment.score, 'number');
const followUp = await call(`learning/questions/${question.id}/follow-ups`, 'POST', {
  requestId: randomUUID(), question: 'Why does the server need to check the signature?',
});
assert.equal(typeof followUp.answer, 'string');
const published = await call('learning/questions', 'POST', {
  requestId: randomUUID(), title: `HTTP signatures ${id}`, prompt: 'Why must an HTTP API verify a token signature before trusting its claims?',
  topics: ['security'], difficulty: 'beginner', language: 'en',
  referenceAnswer: 'Verifying the signature establishes that the claims were signed by the trusted issuer and were not modified.',
  format: 'choice', options: ['To verify integrity', 'To change the HTTP port'], correctOption: 0,
}, 201);
assert.equal(typeof published.question.id, 'string');
await call('learning/progress');
await call('learning/leaderboard');
await call('auth/mobile/password/login', 'POST', {
  identifier: account.email, password: account.password,
}, 403, undefined, { Origin: 'http://localhost:4330' });
await call('auth/logout', 'POST', undefined, 204);
await call('auth/me', 'GET', undefined, 401);
const login = await call('auth/mobile/password/login', 'POST', {
  identifier: account.email, password: account.password,
}, 200, null);
token = login.token;
await call('auth/me');
await call('auth/logout', 'POST', undefined, 204);
console.log(`${passed} native API checks passed (disposable fixtures; no tokens logged).`);
