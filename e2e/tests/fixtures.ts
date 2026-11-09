import { randomUUID } from 'node:crypto';
import { test as base, expect, type Page, type Route } from '@playwright/test';

export const origin = `http://localhost:${process.env.WHYLINT_E2E_FRONTEND_PORT ?? 4200}`;
export const stateKey = 'whylint-google-auth-state';
export const avatarUrl = 'https://lh3.googleusercontent.com/whylint-fixture-avatar.svg';

export const test = base.extend<{ isolateBrowser: void }>({
  extraHTTPHeaders: async ({ extraHTTPHeaders }, use) => {
    await use({ ...extraHTTPHeaders, 'X-WhyLint-TestActor': randomUUID() });
  },
  isolateBrowser: [
    async ({ context, page }, use) => {
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(error.name));
      await context.route('**/*', (route) =>
        new URL(route.request().url()).origin === origin
          ? route.continue()
          : route.abort('blockedbyclient'),
      );
      await use();
      expect(pageErrors, 'The app should not throw unhandled browser errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export function learner() {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  return {
    email: `learner-${suffix}@example.test`,
    username: `learner_${suffix}`,
    password: 'fixture-only correct horse battery staple',
  };
}

export async function browserRequest(page: Page, pathname: string, method = 'GET', data?: unknown) {
  return page.evaluate(
    async ({ pathname, method, data }) => {
      const response = await fetch(pathname, {
        method,
        credentials: 'same-origin',
        cache: 'no-store',
        ...(data === undefined
          ? {}
          : {
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data),
            }),
      });
      const text = await response.text();
      return {
        status: response.status,
        body: text ? JSON.parse(text) : null,
        cacheControl: response.headers.get('cache-control'),
      };
    },
    { pathname, method, data },
  );
}

export async function openGuestLogin(page: Page) {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Googleで続ける', exact: true })).toBeVisible();
}

export async function completeOnboarding(page: Page) {
  await page.addInitScript(() =>
    localStorage.setItem(
      'whylint-onboarding-v1',
      JSON.stringify({
        domain: 'frontend',
        stack: 'javascript',
        onboardingCompleted: true,
      }),
    ),
  );
}

export async function openProfile(page: Page) {
  await page.getByRole('button', { name: 'プロフィール', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'アカウント', exact: true })).toBeVisible();
}

export async function openSettings(page: Page, language = 'ja') {
  const name = language === 'en' ? 'Settings' : '設定';
  const heading = page.getByRole('heading', { name, exact: true });
  if (await heading.isVisible()) return;
  const sidebar = page.locator('.main-nav').getByRole('button', { name, exact: true });
  if (await sidebar.isVisible()) {
    await sidebar.click();
  } else {
    const profile = language === 'en' ? 'Profile' : 'プロフィール';
    await page.locator('.main-nav').getByRole('button', { name: profile, exact: true }).click();
    await page.getByRole('button', { name, exact: true }).click();
  }
  await expect(heading).toBeFocused();
}

export async function openAccountSettings(page: Page) {
  await openSettings(page);
  await page.getByRole('button', { name: 'アカウント設定', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'アカウント設定', exact: true })).toBeVisible();
}

export async function mockGoogleAuthorization(
  page: Page,
  outcome: 'success' | 'invalid-state' | 'rejected' = 'success',
) {
  await page.context().route(avatarUrl, (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44"><rect width="44" height="44" fill="#c3df72"/><circle cx="22" cy="16" r="8" fill="#203314"/><path d="M8 44v-5a14 14 0 0 1 28 0v5" fill="#203314"/></svg>',
    }),
  );
  const code =
    outcome === 'rejected'
      ? 'whylint-fixture-rejected'
      : `whylint-fixture-${randomUUID().replaceAll('-', '')}`;
  let visits = 0;
  await page
    .context()
    .route('https://accounts.google.com/o/oauth2/v2/auth**', async (route: Route) => {
      visits++;
      const query = new URL(route.request().url()).searchParams;
      const state = query.get('state');
      expect(typeof state === 'string' && /^[a-f0-9]{64}$/.test(state)).toBe(true);
      expect(query.get('redirect_uri')).toBe(`${origin}/auth/google/callback`);
      expect(query.get('response_type')).toBe('code');
      expect(query.get('scope')).toBe('openid email profile');
      const callback = new URL('/auth/google/callback', origin);
      callback.searchParams.set(
        'state',
        outcome === 'invalid-state' ? 'fixture-mismatched-state' : state!,
      );
      callback.searchParams.set('code', code);
      await route.fulfill({
        status: 302,
        headers: { location: callback.toString(), 'cache-control': 'no-store' },
        body: '',
      });
    });
  return { visits: () => visits };
}
