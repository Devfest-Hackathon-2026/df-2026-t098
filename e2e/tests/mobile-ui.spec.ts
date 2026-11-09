import { test, expect, learner, origin, openSettings } from './fixtures';
import {
  checkedJson,
  closeLearningDetails,
  expectUsableViewport,
  learningResponse,
  openQuestionDetails,
  prepareLearningAccount,
} from './learning-fixtures';

const sqlQuestionId = '894a7456-75cf-43c8-bb51-02f6b84a6cc3';

test('mobile audit fixes: compact stage, retained retry, detail access and persisted reading size', async ({
  page,
  context,
}, testInfo) => {
  await prepareLearningAccount(page, context, testInfo.project.name, 'mobileui');
  const response = await context.request.get(
    `${origin}/api/v1/learning/questions/${sqlQuestionId}`,
  );
  expect(response.ok()).toBe(true);
  const question = (await response.json()).question;
  expect(question.code).toContain('WHER age');
  await page.route('**/api/v1/learning/daily?*', (route) =>
    route.fulfill({
      json: { day: '2026-11-08', question, answered: 0, solved: 0, solvers: [], you: null },
    }),
  );
  let taps = 0;
  await page.route(`**/api/v1/learning/questions/${sqlQuestionId}/taps`, async (route) => {
    taps++;
    if (taps === 1) return route.fulfill({ status: 503, json: { code: 'UNAVAILABLE' } });
    return route.continue();
  });
  await page.goto('/');
  const card = page.locator(`[data-question-id="${sqlQuestionId}"]`).first();
  await expect(card).toBeVisible();
  const first = card.locator('button.code-line').first();
  expect((await first.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const firstFontSize = await card
    .locator('h2')
    .first()
    .evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
  if (testInfo.project.name === 'mobile-chromium') {
    const bounds = await card.boundingBox();
    const height = await page.locator('.feed-content').evaluate((node) => node.clientHeight);
    expect(bounds!.height).toBeLessThanOrEqual(height + 2);
    await expect(card.getByTestId('question-references')).toBeHidden();
  }
  await first.click();
  const recovery = card.getByTestId('tap-recovery');
  await expect(recovery).toBeVisible();
  await expect(first).toHaveClass(/state-picked/);
  const retried = learningResponse(page, `/questions/${sqlQuestionId}/taps`, 'POST');
  await recovery.getByRole('button', { name: '回答を再送信', exact: true }).click();
  expect((await checkedJson(await retried)).choice).toBe(0);
  await expect(card.locator('.reveal')).toBeVisible();
  await openQuestionDetails(card);
  await expect(card.getByTestId('question-references')).toBeVisible();
  await closeLearningDetails(card);

  await openSettings(page);
  await page.getByRole('radio', { name: 'さらに大きい', exact: true }).check();
  expect(
    await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize)),
  ).toBeGreaterThanOrEqual(20);
  await page.getByRole('button', { name: 'フィード', exact: true }).click();
  expect(
    await card
      .locator('h2')
      .first()
      .evaluate((node) => parseFloat(getComputedStyle(node).fontSize)),
  ).toBeGreaterThan(firstFontSize);
  await expectUsableViewport(page);
  await page.reload();
  await openSettings(page);
  await expect(page.getByRole('radio', { name: 'さらに大きい', exact: true })).toBeChecked();
});

test('guest Explain why returns to the requested question after signup', async ({ page }) => {
  const account = learner();
  await page.goto(`/questions/${sqlQuestionId}`);
  const card = page.locator('.question-card');
  await card.getByRole('button', { name: /なぜ？を説明する/ }).click();
  await expect(page).toHaveURL(/\/login\?returnTo=/);
  expect(new URL(page.url()).searchParams.get('returnTo')).toBe(
    `/questions/${sqlQuestionId}?explain=1`,
  );
  await page.getByRole('link', { name: 'アカウントを作成', exact: true }).click();
  expect(new URL(page.url()).searchParams.get('returnTo')).toBe(
    `/questions/${sqlQuestionId}?explain=1`,
  );
  await page.getByLabel('メールアドレス', { exact: true }).fill(account.email);
  await page.getByLabel('ユーザー名', { exact: true }).fill(account.username);
  await page.getByLabel('パスワード', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'アカウントを作成', exact: true }).click();
  await expect(page).toHaveURL(`${origin}/questions/${sqlQuestionId}?explain=1`);
  await expect(page.locator('textarea[id^="answer-"]')).toBeVisible();
  await expectUsableViewport(page);
});
