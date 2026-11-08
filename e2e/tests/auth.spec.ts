import {
  test,
  expect,
  avatarUrl,
  browserRequest,
  completeOnboarding,
  learner,
  mockGoogleAuthorization,
  openGuestLogin,
  openProfile,
  origin,
  stateKey,
} from './fixtures';

test('guest: real /me rejection, onboarding language and usable login viewport', async ({
  page,
}) => {
  const session = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/v1/auth/me',
  );
  await openGuestLogin(page);
  expect((await session).status()).toBe(401);
  await expect(page).toHaveURL(`${origin}/login`);
  await expect(page.getByRole('heading', { name: 'ログイン', exact: true })).toBeVisible();
  const identifier = page.getByLabel('メールアドレスまたはユーザー名', { exact: true });
  const password = page.getByLabel('パスワード', { exact: true });
  await expect(identifier).toHaveAttribute('autocomplete', 'username');
  await expect(password).toHaveAttribute('autocomplete', 'current-password');
  for (const input of [identifier, password]) {
    await expect(input).toBeInViewport();
    expect(
      await input.evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
    ).toBeGreaterThanOrEqual(16);
  }
  await expect(page.getByRole('button', { name: 'Googleで続ける' })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('.header .settings [aria-label="Switch to English"]')).toHaveCount(0);
  await page.goto('/onboarding?edit=1');
  await page.getByRole('radio', { name: 'English', exact: true }).check();
  await page.goto('/login');
  await expect(page.getByLabel('Email or username', { exact: true })).toBeVisible();
  await page.goto('/onboarding?edit=1');
  await page.getByRole('radio', { name: '日本語', exact: true }).check();
  await page.goto('/login');
  await expect(identifier).toBeVisible();
});

test('password form validates missing credentials without sending authentication requests', async ({
  page,
  context,
}) => {
  await openGuestLogin(page);
  let mutations = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.startsWith('/api/v1/auth/'))
      mutations++;
  });
  await page.getByRole('button', { name: 'ログイン', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'メールアドレスまたはユーザー名を入力してください。',
  );
  await page
    .getByLabel('メールアドレスまたはユーザー名', { exact: true })
    .fill('fixture@example.test');
  await page.getByRole('button', { name: 'ログイン', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('パスワードを入力してください。');
  await page.getByLabel('パスワード', { exact: true }).fill('fixture-only password');
  expect(mutations).toBe(0);
  expect((await context.cookies()).some((cookie) => cookie.name === 'access_token')).toBe(false);
  const stored = await page.evaluate(() =>
    [...Object.values(localStorage), ...Object.values(sessionStorage)].join(' '),
  );
  expect(stored.includes('fixture-only password')).toBe(false);
});

test('UI signup: protected cookie, safe profile and guest-page redirects to onboarding', async ({
  page,
  context,
}, testInfo) => {
  const account = learner();
  await openGuestLogin(page);
  await page.getByRole('link', { name: 'アカウントを作成', exact: true }).click();
  await expect(page).toHaveURL(`${origin}/signup`);
  await expect(page.getByLabel('メールアドレス', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('signup.png'), fullPage: true });
  await page.getByLabel('メールアドレス', { exact: true }).fill(account.email);
  await page.getByLabel('ユーザー名', { exact: true }).fill(account.username);
  await page.getByLabel('パスワード', { exact: true }).fill(account.password);
  const foreground = page.waitForResponse(
    (value) => new URL(value.url()).pathname === '/api/v1/auth/me',
  );
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  expect((await foreground).status()).toBe(401);
  await expect(page.getByLabel('メールアドレス', { exact: true })).toHaveValue(account.email);
  await expect(page.getByLabel('ユーザー名', { exact: true })).toHaveValue(account.username);
  await expect(page.getByLabel('パスワード', { exact: true })).toHaveValue(account.password);
  const response = page.waitForResponse(
    (value) => new URL(value.url()).pathname === '/api/v1/auth/signup',
  );
  await page.getByRole('button', { name: 'アカウントを作成', exact: true }).click();
  const signup = await response;
  expect(signup.status()).toBe(201);
  expect(signup.headers()['cache-control']).toContain('no-store');
  expect(Object.keys(await signup.json())).toEqual(['message']);
  await expect(page).toHaveURL(`${origin}/onboarding`);
  const cookie = (await context.cookies()).find((value) => value.name === 'access_token');
  expect(
    !!cookie &&
      cookie.httpOnly &&
      cookie.secure &&
      cookie.sameSite === 'Lax' &&
      cookie.path === '/',
  ).toBe(true);
  expect(await page.evaluate(() => document.cookie.includes('access_token'))).toBe(false);
  const profile = await browserRequest(page, '/api/v1/auth/me');
  expect(profile.status).toBe(200);
  expect(profile.cacheControl).toContain('no-store');
  expect(Object.keys(profile.body).sort()).toEqual([
    'avatarUrl',
    'email',
    'id',
    'name',
    'username',
  ]);
  expect(profile.body.email).toBe(account.email);
  expect(profile.body.username).toBe(account.username);
  await page.goto('/signup');
  await expect(page).toHaveURL(`${origin}/onboarding`);
  await page.goto('/login');
  await expect(page).toHaveURL(`${origin}/onboarding`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('restored session: /login redirects to the feed and profile survives reload', async ({
  page,
}) => {
  const account = learner();
  await completeOnboarding(page);
  await openGuestLogin(page);
  expect((await browserRequest(page, '/api/v1/auth/signup', 'POST', account)).status).toBe(201);
  await page.goto('/login');
  await expect(page).toHaveURL(`${origin}/`);
  await openProfile(page);
  await expect(page.getByText(account.email, { exact: true })).toBeVisible();
  await page.reload();
  await openProfile(page);
  await expect(page.getByText(account.email, { exact: true })).toBeVisible();
});

test('UI password login: wrong password rejected, email and username restore browser session', async ({
  page,
  context,
}) => {
  const account = learner();
  await openGuestLogin(page);
  expect((await browserRequest(page, '/api/v1/auth/signup', 'POST', account)).status).toBe(201);
  expect((await browserRequest(page, '/api/v1/auth/logout', 'POST')).status).toBe(204);
  await page.getByLabel('メールアドレスまたはユーザー名', { exact: true }).fill(account.email);
  await page.getByLabel('パスワード', { exact: true }).fill('incorrect fixture-only password');
  const wrong = page.waitForResponse(
    (value) => new URL(value.url()).pathname === '/api/v1/auth/password/login',
  );
  await page.getByRole('button', { name: 'ログイン', exact: true }).click();
  expect((await wrong).status()).toBe(401);
  await expect(page.getByRole('alert')).toHaveText(
    'メールアドレス・ユーザー名またはパスワードを確認してください。',
  );
  expect((await context.cookies()).some((cookie) => cookie.name === 'access_token')).toBe(false);
  for (const identifier of [account.email.toUpperCase(), account.username.toUpperCase()]) {
    await openGuestLogin(page);
    await page.getByLabel('メールアドレスまたはユーザー名', { exact: true }).fill(identifier);
    await page.getByLabel('パスワード', { exact: true }).fill(account.password);
    const login = page.waitForResponse(
      (value) => new URL(value.url()).pathname === '/api/v1/auth/password/login',
    );
    await page.getByRole('button', { name: 'ログイン', exact: true }).click();
    expect((await login).status()).toBe(200);
    await expect(page).toHaveURL(`${origin}/onboarding`);
    expect((await browserRequest(page, '/api/v1/auth/me')).body.email).toBe(account.email);
    expect((await browserRequest(page, '/api/v1/auth/logout', 'POST')).status).toBe(204);
  }
});

async function chooseLearningStack(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /^フロントエンド/ }).click();
  await page.getByRole('button', { name: /^次へ/ }).click();
  await page.getByRole('button', { name: 'JavaScript', exact: true }).click();
}

test('Google username: optional onboarding skip, profile save, retry and persistence', async ({
  page,
}, testInfo) => {
  const username = learner().username;
  await mockGoogleAuthorization(page);
  await openGuestLogin(page);
  await page.getByRole('button', { name: 'Googleで続ける', exact: true }).click();
  await expect(page).toHaveURL(`${origin}/onboarding`);
  await chooseLearningStack(page);
  await expect(page.getByLabel('ユーザー名（任意）', { exact: true })).toHaveValue('');
  await page.screenshot({ path: testInfo.outputPath('onboarding-username.png'), fullPage: true });
  await page.getByRole('button', { name: /^学習を始める/ }).click();
  await expect(page).toHaveURL(`${origin}/`);
  expect((await browserRequest(page, '/api/v1/auth/me')).body.username).toBeNull();
  await openProfile(page);
  await page.screenshot({ path: testInfo.outputPath('profile-username.png'), fullPage: true });
  await page.getByLabel('ユーザー名（任意）', { exact: true }).fill(`  ${username}  `);
  const foreground = page.waitForResponse(
    (value) => new URL(value.url()).pathname === '/api/v1/auth/me',
  );
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  expect((await foreground).status()).toBe(200);
  await expect(page.getByLabel('ユーザー名（任意）', { exact: true })).toHaveValue(
    `  ${username}  `,
  );
  await page.route('**/api/v1/auth/me/username', (route) => route.fulfill({ status: 503 }));
  await page.getByRole('button', { name: 'ユーザー名を保存', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('接続を確認して');
  await page.unroute('**/api/v1/auth/me/username');
  await page.getByRole('button', { name: 'ユーザー名を保存', exact: true }).click();
  await expect(page.getByText(`@${username}`, { exact: true })).toBeVisible();
  await expect(page.getByLabel('ユーザー名（任意）', { exact: true })).toHaveCount(0);
  await page.reload();
  await openProfile(page);
  await expect(page.getByText(`@${username}`, { exact: true })).toBeVisible();
  expect((await browserRequest(page, '/api/v1/auth/me')).body.username).toBe(username);
});

test('Google username: onboarding save persists across Google re-login', async ({ page }) => {
  const username = `学習_${learner().username}`;
  await mockGoogleAuthorization(page);
  await openGuestLogin(page);
  await page.getByRole('button', { name: 'Googleで続ける', exact: true }).click();
  await expect(page).toHaveURL(`${origin}/onboarding`);
  await chooseLearningStack(page);
  await page.getByLabel('ユーザー名（任意）', { exact: true }).fill(username);
  await page.getByRole('button', { name: /^学習を始める/ }).click();
  await expect(page).toHaveURL(`${origin}/`);
  await openProfile(page);
  await expect(page.getByText(`@${username}`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'ログアウト', exact: true }).click();
  await page.getByRole('link', { name: /Googleでログイン/ }).click();
  await page.getByRole('button', { name: 'Googleで続ける', exact: true }).click();
  await expect(page).toHaveURL(`${origin}/`);
  await openProfile(page);
  await expect(page.getByText(`@${username}`, { exact: true })).toBeVisible();
});

test('UI logout: revokes a copied cookie, preserves another session and restores guest UI', async ({
  page,
  context,
  browser,
  playwright,
}) => {
  const account = learner();
  await completeOnboarding(page);
  await openGuestLogin(page);
  expect((await browserRequest(page, '/api/v1/auth/signup', 'POST', account)).status).toBe(201);
  const cookie = (await context.cookies()).find((value) => value.name === 'access_token');
  if (!cookie) throw new Error('The fixture account did not receive a cookie');
  const other = await browser.newContext();
  const replay = await playwright.request.newContext({
    baseURL: origin,
    extraHTTPHeaders: { Cookie: `access_token=${cookie.value}` },
  });
  try {
    expect((await replay.get('/api/v1/auth/me')).status()).toBe(200);
    const denied = await replay.post('/api/v1/auth/logout', {
      headers: { Origin: 'https://untrusted.example.test' },
    });
    expect(denied.status()).toBe(403);
    expect((await replay.get('/api/v1/auth/me')).status()).toBe(200);
    const otherPage = await other.newPage();
    await otherPage.goto(`${origin}/login`);
    expect(
      (
        await browserRequest(otherPage, '/api/v1/auth/password/login', 'POST', {
          identifier: account.username,
          password: account.password,
        })
      ).status,
    ).toBe(200);
    await page.goto('/');
    await openProfile(page);
    const button = page.getByRole('button', { name: 'ログアウト', exact: true });
    await expect(button).toBeInViewport();
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const logout = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/v1/auth/logout',
    );
    await button.click();
    expect((await logout).status()).toBe(204);
    await expect(page.getByRole('link', { name: /Googleでログイン/ })).toBeVisible();
    expect((await context.cookies()).some((value) => value.name === 'access_token')).toBe(false);
    expect((await replay.get('/api/v1/auth/me')).status()).toBe(401);
    expect((await browserRequest(otherPage, '/api/v1/auth/me')).status).toBe(200);
    await openGuestLogin(page);
  } finally {
    await other.close();
    await replay.dispose();
  }
});

test('UI logout: retains account on failure, disables repeat clicks and retries successfully', async ({
  page,
  context,
}) => {
  const account = learner();
  await completeOnboarding(page);
  await openGuestLogin(page);
  expect((await browserRequest(page, '/api/v1/auth/signup', 'POST', account)).status).toBe(201);
  await page.goto('/');
  await openProfile(page);
  await page.route('**/api/v1/auth/logout', (route) => route.fulfill({ status: 503 }));
  const button = page.getByRole('button', { name: 'ログアウト', exact: true });
  await button.click();
  await expect(page.getByRole('alert')).toHaveText(
    'ログアウトできませんでした。もう一度お試しください。',
  );
  await expect(page.getByText(account.email, { exact: true })).toBeVisible();
  expect((await context.cookies()).some((cookie) => cookie.name === 'access_token')).toBe(true);
  await page.unroute('**/api/v1/auth/logout');

  let release!: () => void;
  const waitForRelease = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route('**/api/v1/auth/logout', async (route) => {
    requests++;
    await waitForRelease;
    await route.continue();
  });
  try {
    await button.click();
    const pending = page.getByRole('button', { name: 'ログアウト中…', exact: true });
    await expect(pending).toBeDisabled();
    await expect(pending).toHaveAttribute('aria-busy', 'true');
    await pending.evaluate((element: HTMLButtonElement) => element.click());
    await expect.poll(() => requests).toBe(1);
  } finally {
    release();
  }
  await expect(page.getByRole('link', { name: /Googleでログイン/ })).toBeVisible();
  expect((await context.cookies()).some((cookie) => cookie.name === 'access_token')).toBe(false);
  expect((await browserRequest(page, '/api/v1/auth/me')).status).toBe(401);
});

test('session outage: sign-in controls stay hidden, retry returns to the real backend', async ({
  page,
}) => {
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ status: 503, json: { message: 'Fixture outage' } }),
  );
  await page.goto('/login');
  await expect(page.getByRole('alert')).toContainText('アカウントを確認できませんでした。');
  await expect(page.getByRole('button', { name: 'Googleで続ける' })).toHaveCount(0);
  await expect(page.getByLabel('パスワード', { exact: true })).toHaveCount(0);
  await page.unroute('**/api/v1/auth/me');
  const realCheck = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/v1/auth/me',
  );
  await page.getByRole('button', { name: '再試行', exact: true }).click();
  expect((await realCheck).status()).toBe(401);
  await expect(page.getByRole('button', { name: 'Googleで続ける' })).toBeVisible();
});

test('mocked Google: button, one-time callback, real backend exchange and persistent profile', async ({
  page,
  context,
}) => {
  await completeOnboarding(page);
  const google = await mockGoogleAuthorization(page);
  await openGuestLogin(page);
  const exchange = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/v1/auth/login',
  );
  await page.getByRole('button', { name: 'Googleで続ける' }).click();
  expect((await exchange).status()).toBe(201);
  await expect(page).toHaveURL(`${origin}/`);
  expect(google.visits()).toBe(1);
  expect(await page.evaluate((key) => sessionStorage.getItem(key) === null, stateKey)).toBe(true);
  expect(
    (await context.cookies()).some((cookie) => cookie.name === 'access_token' && cookie.httpOnly),
  ).toBe(true);
  expect(await page.evaluate(() => document.cookie.includes('access_token'))).toBe(false);
  await openProfile(page);
  await expect(page.getByText('WhyLint Test Learner', { exact: true })).toBeVisible();
  const picture = page.locator('.account-avatar img');
  await expect(picture).toHaveAttribute('src', avatarUrl);
  await expect(picture).toBeVisible();
  await expect
    .poll(() =>
      picture.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0),
    )
    .toBe(true);
  await page.reload();
  await openProfile(page);
  await expect(page.getByText('WhyLint Test Learner', { exact: true })).toBeVisible();
  const profile = await browserRequest(page, '/api/v1/auth/me');
  expect(profile.body.email.endsWith('@example.test')).toBe(true);
  expect(profile.body.avatarUrl).toBe(avatarUrl);
  await page.route(avatarUrl, (route) => route.abort());
  await page.reload();
  await openProfile(page);
  await expect(page.locator('.account-avatar img')).toHaveCount(0);
  await expect(page.locator('.account-avatar svg')).toBeVisible();
});

test('mocked Google: mismatched state is consumed and rejected without backend exchange', async ({
  page,
  context,
}) => {
  await mockGoogleAuthorization(page, 'invalid-state');
  await openGuestLogin(page);
  let exchanges = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/v1/auth/login')
      exchanges++;
  });
  await page.getByRole('button', { name: 'Googleで続ける' }).click();
  await expect(page.getByRole('alert')).toContainText('ログインを確認できませんでした。');
  await expect(page).toHaveURL(`${origin}/login`);
  expect(await page.evaluate((key) => sessionStorage.getItem(key) === null, stateKey)).toBe(true);
  expect(exchanges).toBe(0);
  expect((await context.cookies()).some((cookie) => cookie.name === 'access_token')).toBe(false);
  // A direct callback has no state left to consume and must also fail locally.
  await page.goto('/auth/google/callback?state=fixture-reused&code=whylint-fixture-rejected');
  await expect(page.getByRole('alert')).toContainText('ログインを確認できませんでした。');
  await expect(page).toHaveURL(`${origin}/login`);
  expect(exchanges).toBe(0);
});

test('mocked Google: provider rejects the fixture code and leaves a retryable guest screen', async ({
  page,
  context,
}) => {
  await mockGoogleAuthorization(page, 'rejected');
  await openGuestLogin(page);
  const exchange = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/v1/auth/login',
  );
  await page.getByRole('button', { name: 'Googleで続ける' }).click();
  expect((await exchange).status()).toBe(401);
  await expect(page.getByRole('alert')).toContainText('ログインを確認できませんでした。');
  await expect(page).toHaveURL(`${origin}/login`);
  await expect(page.getByRole('button', { name: 'Googleで続ける' })).toBeEnabled();
  expect((await context.cookies()).some((cookie) => cookie.name === 'access_token')).toBe(false);
});
