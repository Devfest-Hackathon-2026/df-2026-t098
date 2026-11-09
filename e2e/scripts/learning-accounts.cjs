const { createHash } = require('node:crypto');

function fixtureUuid(label) {
  const value = createHash('sha256').update(`whylint-browser-fixture:${label}`).digest('hex');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-4${value.slice(13, 16)}-a${value.slice(17, 20)}-${value.slice(20, 32)}`;
}

function accountFor(project, scenario, role = 'learner') {
  const device = project.startsWith('mobile') ? 'mobile' : 'desktop';
  const label = `${device}-${scenario}-${role}`;
  return {
    userId: fixtureUuid(`user:${label}`),
    sessionId: fixtureUuid(`session:${label}`),
    username: `core_${device}_${scenario}_${role}`,
  };
}

async function seedLearningAccounts(database) {
  if (
    process.env.WHYLINT_E2E !== '1' ||
    !/^postgresql:\/\/whylint_test@127\.0\.0\.1:\d+\/whylint_auth_e2e_browser$/.test(
      process.env.DB_URL ?? '',
    )
  ) {
    throw new Error('Learning fixture accounts require the disposable browser database');
  }
  for (const project of ['mobile-chromium', 'desktop-chromium']) {
    for (const scenario of ['learning', 'community', 'recovery', 'social', 'regressions', 'variety', 'mobileui', 'paging', 'paging-long', 'paging-arcs', 'uiaudit', 'safety']) {
      for (const role of ['learner', 'reader']) {
        const account = accountFor(project, scenario, role);
        await database.query(
          'INSERT INTO users (id, email, username, name) VALUES ($1, $2, $3, $4)',
          [account.userId, `${account.username}@example.test`, account.username, account.username],
        );
        await database.query(
          "INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, now() + interval '1 hour')",
          [account.sessionId, account.userId],
        );
      }
    }
  }
}

module.exports = { accountFor, seedLearningAccounts };
