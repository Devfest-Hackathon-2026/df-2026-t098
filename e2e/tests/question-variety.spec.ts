import { randomUUID } from 'node:crypto';
import { test, expect, origin } from './fixtures';
import { checkedJson, prepareLearningAccount } from './learning-fixtures';

const httpsQuestionId = '48429fd0-e797-446d-8270-3a90dc9e752c';
const firstHttpsPrompt =
  'Why does a secure website use HTTPS instead of HTTP when handling personal user data? Choose the best explanation.';
const secondHttpsPrompt =
  'Why should a website use HTTPS instead of standard HTTP when transmitting personal data? Choose the best reason and explain why.';
const preferences = {
  interests: ['security'],
  technologies: ['VarietyFixture'],
  difficulty: 'beginner',
  language: 'en',
};

test('variety: seen pool questions exclude reworded Gemini concepts and retries preserve the result', async ({
  page,
  context,
}, testInfo) => {
  await prepareLearningAccount(page, context, testInfo.project.name, 'variety');
  expect(
    (
      await context.request.put(`${origin}/api/v1/learning/preferences`, {
        headers: { Origin: origin },
        data: preferences,
      })
    ).ok(),
  ).toBe(true);
  const seen = await context.request.get(`${origin}/api/v1/learning/questions/${httpsQuestionId}`);
  expect(seen.ok()).toBe(true);
  expect((await seen.json()).question.prompt).toBe(secondHttpsPrompt);
  const body = { requestId: randomUUID(), language: 'en', excludeQuestionIds: [httpsQuestionId] };
  const response = await context.request.post(`${origin}/api/v1/learning/feed/batches`, {
    headers: { Origin: origin },
    data: body,
  });
  expect(response.ok()).toBe(true);
  const batch = await response.json();
  expect(batch.questions).toHaveLength(5);
  for (const question of batch.questions) {
    expect(question.prompt).not.toBe(firstHttpsPrompt);
    expect(question.prompt).not.toBe(secondHttpsPrompt);
    expect(question.novelty.version).toBe(1);
    expect(question).not.toHaveProperty('correctOption');
    expect(question).not.toHaveProperty('referenceAnswer');
  }
  const replay = await context.request.post(`${origin}/api/v1/learning/feed/batches`, {
    headers: { Origin: origin },
    data: body,
  });
  expect(replay.ok()).toBe(true);
  expect((await replay.json()).questions.map((question: { id: string }) => question.id)).toEqual(
    batch.questions.map((question: { id: string }) => question.id),
  );
  const mismatch = await context.request.post(`${origin}/api/v1/learning/feed/batches`, {
    headers: { Origin: origin },
    data: { ...body, excludeQuestionIds: [] },
  });
  expect(mismatch.status()).toBe(409);
});

test('variety: a pool question arriving during generation suppresses its later Gemini paraphrase', async ({
  page,
  context,
}, testInfo) => {
  await prepareLearningAccount(page, context, testInfo.project.name, 'variety', 'reader');
  expect(
    (
      await context.request.put(`${origin}/api/v1/learning/preferences`, {
        headers: { Origin: origin },
        data: preferences,
      })
    ).ok(),
  ).toBe(true);
  const seen = await context.request.get(`${origin}/api/v1/learning/questions/${httpsQuestionId}`);
  const httpsQuestion = (await seen.json()).question;
  const exclude: string[] = [];
  const initialQuestions: (typeof httpsQuestion)[] = [];
  for (let attempt = 0; attempt < 8 && initialQuestions.length < 5; attempt++) {
    const query = new URLSearchParams({ language: 'en', difficulty: 'beginner' });
    if (exclude.length) query.set('exclude', exclude.join(','));
    const response = await context.request.get(`${origin}/api/v1/learning/feed/pool?${query}`);
    expect(response.ok()).toBe(true);
    const pool = await response.json();
    if (!pool.questions.length) break;
    for (const question of pool.questions) {
      exclude.push(question.id);
      if (question.code && initialQuestions.length < 5) initialQuestions.push(question);
    }
  }
  expect(initialQuestions).toHaveLength(5);
  let pools = 0;
  await page.route('**/api/v1/learning/daily?*', (route) =>
    route.fulfill({
      json: { day: '2026-11-08', question: null, answered: 0, solved: 0, solvers: [], you: null },
    }),
  );
  await page.route('**/api/v1/learning/feed/pool?*', (route) => {
    pools++;
    return route.fulfill({
      json: {
        questions: pools === 1 ? initialQuestions : pools === 2 ? [httpsQuestion] : [],
        reviewQuestions: [],
      },
    });
  });
  let release!: () => void;
  const writing = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/learning/feed/batches', async (route) => {
    await writing;
    await route.continue();
  });
  const requested = page.waitForRequest((request) => request.url().endsWith('/feed/batches'));
  const generated = page.waitForResponse((response) => response.url().endsWith('/feed/batches'));
  await page.goto('/');
  const request = await requested;
  expect(request.postDataJSON().excludeQuestionIds).not.toContain(httpsQuestionId);
  try {
    await expect(page.locator('.question-card')).toHaveCount(5);
    await page
      .locator('.feed-slide')
      .nth(3)
      .evaluate((slide) => slide.scrollIntoView({ block: 'start', behavior: 'instant' }));
    await expect(page.locator(`[data-question-id="${httpsQuestionId}"]`)).toBeAttached();
  } finally {
    release();
  }
  const batch = await checkedJson(await generated);
  const paraphrase = batch.questions.find(
    (question: { prompt: string }) => question.prompt === firstHttpsPrompt,
  );
  expect(paraphrase).toBeTruthy();
  await expect(page.locator(`[data-question-id="${paraphrase.id}"]`)).toHaveCount(0);
  await expect(page.locator(`[data-question-id="${httpsQuestionId}"]`)).toHaveCount(1);
  await expect(page.locator('.question-card')).toHaveCount(10);
});
