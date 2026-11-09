import { test, expect, browserRequest, openSettings, openProfile, origin } from "./fixtures";
import {
  checkedJson,
  settledBox,
  explanationField,
  openQuestionDetails,
  closeLearningDetails,
  expectUsableViewport,
  learningResponse,
  prepareLearningAccount,
  submitFixtureAnswer,
} from "./learning-fixtures";

test("learning: instant pool, background Gemini batches, tap then explain, one-time XP and ranking", async ({
  page,
  context,
  browser,
}, testInfo) => {
  const account = await prepareLearningAccount(
    page,
    context,
    testInfo.project.name,
    "learning",
  );
  let generatedBatches = 0;
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === "/api/v1/learning/feed/batches" &&
      request.method() === "POST"
    )
      generatedBatches++;
  });
  const poolResponse = learningResponse(page, "/feed/pool", "GET");
  const initialResponse = learningResponse(page, "/feed/batches", "POST");
  await page.goto("/");
  const pool = await checkedJson(await poolResponse);
  expect(pool.questions.length).toBeGreaterThan(0);
  for (const question of pool.questions) {
    expect(question.format).not.toBe("explain");
    expect(question).not.toHaveProperty("correctOption");
    expect(question.tap).toBeNull();
  }
  await expect(
    page.locator(`[data-question-id="${pool.questions[0].id}"]`).first(),
  ).toBeVisible();
  const initialHttp = await initialResponse;
  const initial = await checkedJson(initialHttp);
  expect(initial.questions).toHaveLength(5);
  expect(
    initial.questions.some((question: { topics: string[] }) =>
      question.topics.includes("general"),
    ),
  ).toBe(true);
  expect(
    new Set(initial.questions.map((question: { id: string }) => question.id))
      .size,
  ).toBe(5);
  for (const question of initial.questions) {
    expect(question).not.toHaveProperty("referenceAnswer");
    expect(question).not.toHaveProperty("rubric");
    expect(question).not.toHaveProperty("correctOption");
    await expect(
      page.locator(`[data-question-id="${question.id}"]`),
    ).toBeAttached();
  }
  await expectUsableViewport(page);
  await page.screenshot({
    path: testInfo.outputPath("core-feed.png"),
    fullPage: true,
  });
  expect(generatedBatches).toBe(1);
  await expect(page.locator(".feed-controls")).toHaveCount(0);
  const prefetch = learningResponse(page, "/feed/batches", "POST");
  const slides = page.locator(".feed-slide");
  await slides
    .nth((await slides.count()) - 2)
    .evaluate((slide) =>
      slide.scrollIntoView({ block: "start", behavior: "instant" }),
    );
  const next = await checkedJson(await prefetch);
  expect(next.questions).toHaveLength(5);
  expect(
    next.questions.every(
      (question: { id: string }) =>
        !initial.questions.some(
          (first: { id: string }) => first.id === question.id,
        ),
    ),
  ).toBe(true);
  expect(generatedBatches).toBe(2);

  const replayedBatch = await browserRequest(
    page,
    "/api/v1/learning/feed/batches",
    "POST",
    initialHttp.request().postDataJSON(),
  );
  expect([200, 201]).toContain(replayedBatch.status);
  expect(
    replayedBatch.body.questions.map((question: { id: string }) => question.id),
  ).toEqual(initial.questions.map((question: { id: string }) => question.id));

  const question = initial.questions[2];
  const card = page.locator(`[data-question-id="${question.id}"]`).first();
  // Use a guest so this tap does not change the learner’s history.
  const guest = await browser.newContext();
  let correctIndex: number;
  try {
    const preview = await guest.request.post(
      `${origin}/api/v1/learning/questions/${question.id}/taps`,
      { headers: { Origin: origin }, data: { choice: 0 } },
    );
    expect(preview.ok()).toBe(true);
    correctIndex = (await preview.json()).correctOption;
  } finally {
    await guest.close();
  }
  const wrongIndex = correctIndex === 0 ? 1 : 0;
  const tapResponse = learningResponse(
    page,
    `/questions/${question.id}/taps`,
    "POST",
  );
  await card.locator(".quiz-option").nth(wrongIndex).click();
  const tap = await checkedJson(await tapResponse);
  expect(tap).toMatchObject({
    correct: false,
    choice: wrongIndex,
    correctOption: correctIndex,
    xpAwarded: 0,
  });
  const readFeedback = card.getByRole("button", {
    name: "解説を見る",
    exact: true,
  });
  if (await readFeedback.isVisible()) {
    await readFeedback.click();
    await expect(card.locator("dialog[open] .reveal")).toContainText(
      tap.quickExplanation,
    );
    await closeLearningDetails(card);
  } else {
    await expect(card.locator(".reveal")).toContainText(tap.quickExplanation);
  }
  await expect(card.locator(".quiz-option").nth(correctIndex)).toHaveClass(
    /state-correct/,
  );
  await expect(page.locator(`[data-question-id="${question.id}"]`)).toHaveCount(
    2,
  );
  await (
    await explanationField(card)
  ).fill(
    "fixture-fail: I think requests remember who made the previous request.",
  );
  const failedResponse = learningResponse(
    page,
    `/questions/${question.id}/attempts`,
    "POST",
  );
  await card
    .getByRole("button", { name: "理解度をチェック", exact: true })
    .click();
  const failed = await checkedJson(await failedResponse);
  expect(failed.score).toBe(6);
  expect(failed.passed).toBe(false);
  expect(failed.xpAwarded).toBe(5);
  const reviews = await browserRequest(page, "/api/v1/learning/reviews");
  expect(
    reviews.body.questions.map((value: { id: string }) => value.id),
  ).toContain(question.id);
  await closeLearningDetails(card);
  await page.getByRole("button", { name: "復習", exact: true }).first().click();
  await expect(
    page.getByText(question.prompt, { exact: true }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("core-review.png"),
    fullPage: true,
  });

  await page.goto(`/questions/${question.id}`);
  const retryCard = page.locator(`[data-question-id="${question.id}"]`);
  await expect(retryCard.locator(".reason-chip")).toContainText("間違えた");
  await expect(retryCard.locator(".reveal")).toHaveCount(0);
  await expect(retryCard.locator(".quiz-option").first()).toBeEnabled();
  const answer =
    "fixture-pass: HTTP requests are independent, so the server verifies the credentials for each request.";
  await (await explanationField(retryCard)).fill(answer);
  const passedResponse = learningResponse(
    page,
    `/questions/${question.id}/attempts`,
    "POST",
  );
  await retryCard
    .getByRole("button", { name: "理解度をチェック", exact: true })
    .click();
  const passedHttp = await passedResponse;
  const submitted = passedHttp.request().postDataJSON();
  const passed = await checkedJson(passedHttp);
  expect(passed.score).toBe(9);
  expect(passed.passed).toBe(true);
  expect(passed.xpAwarded).toBe(15);
  expect(
    (await browserRequest(page, "/api/v1/learning/reviews")).body.questions,
  ).toEqual([]);
  const replayedAssessment = await browserRequest(
    page,
    `/api/v1/learning/questions/${question.id}/attempts`,
    "POST",
    submitted,
  );
  expect(replayedAssessment.body).toEqual(passed);
  let progress = (await browserRequest(page, "/api/v1/learning/progress")).body;
  expect(progress.totalXp).toBe(20);
  expect(progress.dailyCompleted).toBe(1);
  for (const other of initial.questions.filter(
    (value: { id: string }) => value.id !== question.id,
  )) {
    const result = await submitFixtureAnswer(page, other.id);
    expect(result.passed).toBe(true);
  }
  progress = (await browserRequest(page, "/api/v1/learning/progress")).body;
  expect(progress).toMatchObject({
    totalXp: 100,
    level: 2,
    dailyGoal: 5,
    dailyCompleted: 5,
    passedQuestions: 5,
    streak: 1,
    timezone: "Asia/Tokyo",
  });
  expect(
    progress.achievements.some((badge: { earned: boolean }) => badge.earned),
  ).toBe(true);
  const leaderboard = (
    await browserRequest(page, "/api/v1/learning/leaderboard")
  ).body;
  expect(leaderboard.timezone).toBe("Asia/Tokyo");
  expect(
    leaderboard.entries.find(
      (entry: { user: { id: string } }) => entry.user.id === account.userId,
    )?.xp,
  ).toBe(100);
  expect(JSON.stringify(leaderboard)).not.toContain("@example.test");
  await page.goto("/");
  await page
    .getByRole("button", { name: "ランキング", exact: true })
    .first()
    .click();
  const ownRanking = page
    .getByRole("listitem")
    .filter({ hasText: account.username });
  await expect(ownRanking).toBeVisible();
  await expect(ownRanking.getByText("100 XP", { exact: true })).toBeVisible();
  await expectUsableViewport(page);
  await page.screenshot({
    path: testInfo.outputPath("core-ranking.png"),
    fullPage: true,
  });
  await openProfile(page);
  const goal = page.getByRole("heading", { name: "今日の目標", exact: true });
  await expect(goal).toBeVisible();
  await expect(page.locator(".profile-settings")).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("core-progress.png"),
    fullPage: true,
  });

  await page.goto("/onboarding?edit=1");
  await page.getByRole("button", { name: "ネットワーク", exact: true }).click();
  await page.getByRole("button", { name: "次へ", exact: true }).click();
  const technologySearch = page.getByLabel("言語・技術を検索", { exact: true });
  await technologySearch.fill("Rust");
  await page.getByRole("button", { name: "Rust", exact: true }).click();
  await technologySearch.fill("Effect-TS");
  await page
    .getByRole("button", { name: "追加する：Effect-TS", exact: true })
    .click();
  await page.getByRole("button", { name: "中級", exact: true }).click();
  const preferencesResponse = learningResponse(page, "/preferences", "PUT");
  await page.getByRole("button", { name: "学習を始める", exact: true }).click();
  const updated = (await checkedJson(await preferencesResponse)).preferences;
  expect(updated.interests).toEqual(
    expect.arrayContaining(["backend", "security", "networking"]),
  );
  expect(updated.technologies).toEqual(
    expect.arrayContaining(["Rust", "Effect-TS"]),
  );
  expect(updated.difficulty).toBe("intermediate");
  await expect(page).toHaveURL(`${origin}/`);
  expect(
    (await browserRequest(page, "/api/v1/learning/preferences")).body
      .preferences,
  ).toEqual(updated);
});

test("learning: centered feed and responsive comments preserve drafts and question access", async ({
  page,
  context,
}, testInfo) => {
  await prepareLearningAccount(
    page,
    context,
    testInfo.project.name,
    "learning",
    "reader",
  );
  const desktop = testInfo.project.name === "desktop-chromium";
  if (desktop) await page.setViewportSize({ width: 1920, height: 1080 });
  const initialResponse = learningResponse(page, "/feed/batches", "POST");
  await page.goto("/");
  const batch = await checkedJson(await initialResponse);
  expect(
    batch.questions.every(
      (question: { difficulty: string }) => question.difficulty === "beginner",
    ),
  ).toBe(true);
  const questionId = batch.questions[0].id;
  const card = page.locator(`[data-question-id="${questionId}"]`).first();
  await card.scrollIntoViewIfNeeded();
  await expect(card).toBeVisible();

  if (desktop) {
    const shell = await page.locator(".app-shell").boundingBox();
    const content = await page.locator(".content").boundingBox();
    const bounds = await card.boundingBox();
    const reading = await card.locator(".question-content").boundingBox();
    const actions = await card.locator(".card-actions").boundingBox();
    expect(shell!.x).toBe(0);
    expect(shell!.width).toBe(1920);
    expect(bounds!.width).toBeLessThanOrEqual(760);
    expect(
      Math.abs(bounds!.x + bounds!.width / 2 - content!.x - content!.width / 2),
    ).toBeLessThan(2);
    expect(reading!.width).toBeGreaterThanOrEqual(600);
    expect(reading!.width).toBeLessThanOrEqual(680);
    expect(actions!.x).toBeGreaterThanOrEqual(reading!.x + reading!.width + 12);
    expect(actions!.height).toBeGreaterThan(actions!.width);
  }

  const comments = card.getByRole("button", { name: "コメント", exact: true });
  const panel = page.getByRole("dialog", { name: "コメント", exact: true });
  const heading = panel.getByRole("heading", { name: "コメント", exact: true });
  const close = panel.getByRole("button", {
    name: "コメントを閉じる",
    exact: true,
  });
  let releaseComments!: () => void;
  const waitingComments = new Promise<void>((resolve) => {
    releaseComments = resolve;
  });
  const commentRoute = `**/api/v1/learning/questions/${questionId}/comments`;
  await page.route(commentRoute, async (route) => {
    await waitingComments;
    await route.continue();
  });
  const loadedComments = learningResponse(
    page,
    `/questions/${questionId}/comments`,
    "GET",
  );
  try {
    await comments.click();
    await expect(panel.locator("app-loading-skeleton")).toBeVisible();
    await expect(
      panel.getByRole("button", { name: "コメントを投稿", exact: true }),
    ).toBeDisabled();
  } finally {
    releaseComments();
  }
  await checkedJson(await loadedComments);
  await page.unroute(commentRoute);
  await expect(comments).toHaveAttribute("aria-expanded", "true");
  await expect(heading).toBeInViewport();
  await expect(heading).toBeFocused();
  await expect(panel).toHaveAttribute("aria-modal", String(!desktop));
  expect(await panel.evaluate((node) => node.matches(":modal"))).toBe(!desktop);

  if (desktop) {
    const bounds = await settledBox(panel);
    const reading = await card.locator(".question-content").boundingBox();
    expect(bounds).toEqual({ x: 1560, y: 0, width: 360, height: 1080 });
    expect(reading!.x + reading!.width).toBeLessThan(bounds!.x);
    await (await explanationField(card)).fill("My explanation draft.");
  } else {
    const bounds = await settledBox(panel);
    const viewport = page.viewportSize()!;
    expect(bounds!.width).toBe(viewport.width);
    expect(Math.abs(bounds!.y + bounds!.height - viewport.height)).toBeLessThan(
      1,
    );
    await page.keyboard.press("Shift+Tab");
    expect(
      await panel.evaluate((node) => node.contains(document.activeElement)),
    ).toBe(true);
  }

  const draft = "考えを整理してから投稿します。";
  await panel.getByLabel("コメントを書く", { exact: true }).fill(draft);
  await close.click();
  await expect(comments).toHaveAttribute("aria-expanded", "false");
  await expect(comments).toBeFocused();
  await comments.click();
  await expect(panel.getByLabel("コメントを書く", { exact: true })).toHaveValue(
    draft,
  );

  if (!desktop) {
    await expect(panel).toBeVisible();
    await settledBox(panel);
    await page.mouse.click(10, 10);
    await expect(panel).toHaveCount(0);
    await expect(comments).toBeFocused();
    await comments.click();
    await expect(
      panel.getByLabel("コメントを書く", { exact: true }),
    ).toHaveValue(draft);
  }

  if (desktop) {
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(panel).toHaveAttribute("aria-modal", "true");
    await expect
      .poll(() => panel.evaluate((node) => node.matches(":modal")))
      .toBe(true);
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(panel).toHaveAttribute("aria-modal", "false");
    await expect
      .poll(() => panel.evaluate((node) => node.matches(":modal")))
      .toBe(false);
    await expect(
      panel.getByLabel("コメントを書く", { exact: true }),
    ).toHaveValue(draft);
    await page.setViewportSize({ width: 1920, height: 1080 });
  }
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(comments).toBeFocused();

  await (
    await explanationField(card)
  ).fill(
    "fixture-pass: Each independent request carries credentials that the server can verify.",
  );
  const assessed = learningResponse(
    page,
    `/questions/${questionId}/attempts`,
    "POST",
  );
  await card
    .getByRole("button", { name: "理解度をチェック", exact: true })
    .click();
  expect((await checkedJson(await assessed)).passed).toBe(true);
  await closeLearningDetails(card);
  await comments.click();
  await expect(heading).toBeInViewport();
  await expect(heading).toBeFocused();
  const text = "基本から説明すると理解しやすいです。";
  await panel.getByLabel("コメントを書く", { exact: true }).fill(text);
  const posted = learningResponse(
    page,
    `/questions/${questionId}/comments`,
    "POST",
  );
  await panel
    .getByRole("button", { name: "コメントを投稿", exact: true })
    .click();
  expect((await checkedJson(await posted)).text).toBe(text);
  await expect(panel.getByText(text, { exact: true })).toBeVisible();
  await expectUsableViewport(page);
  await page.screenshot({
    path: testInfo.outputPath("centered-feed-comments.png"),
    fullPage: true,
  });
  await close.click();
  const nextCard = page
    .locator(`[data-question-id="${batch.questions[1].id}"]`)
    .first();
  await nextCard.getByRole("button", { name: "コメント", exact: true }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(1);
  await expect(panel).toHaveCount(1);
  await expect(panel).toHaveAttribute(
    "id",
    `discussion-${batch.questions[1].id}`,
  );
  await expect(panel.getByLabel("コメントを書く", { exact: true })).toHaveValue(
    "",
  );
});

test("community: publish, surface for another learner, like, save, comment and share", async ({
  page,
  context,
  browser,
}, testInfo) => {
  const author = await prepareLearningAccount(
    page,
    context,
    testInfo.project.name,
    "community",
  );
  await page.goto("/");
  await page.getByRole("button", { name: "投稿", exact: true }).first().click();
  const title = `認証の考え方 ${testInfo.project.name}`;
  await page.getByLabel("タイトル", { exact: true }).fill(title);
  await page
    .getByLabel("質問", { exact: true })
    .fill("なぜ各 HTTP リクエストで認証情報を確認する必要があるのでしょう？");
  await page
    .getByLabel("お手本の説明", { exact: true })
    .fill(
      "HTTP requests are independent, so each request must carry verifiable authentication information.",
    );
  await page.screenshot({
    path: testInfo.outputPath("core-publish.png"),
    fullPage: true,
  });
  const publishedResponse = learningResponse(page, "/questions", "POST");
  await page.getByRole("button", { name: "質問を投稿", exact: true }).click();
  const publishedHttp = await publishedResponse;
  const submittedQuestion = publishedHttp.request().postDataJSON();
  expect(submittedQuestion.requestId).toMatch(
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i,
  );
  const published = (await checkedJson(publishedHttp)).question;
  expect(published.source).toBe("community");
  expect(published.author.id).toBe(author.userId);
  expect(published).not.toHaveProperty("referenceAnswer");
  expect(published).not.toHaveProperty("rubric");
  const replayedPublication = await browserRequest(
    page,
    "/api/v1/learning/questions",
    "POST",
    submittedQuestion,
  );
  expect([200, 201]).toContain(replayedPublication.status);
  expect(replayedPublication.body.question.id).toBe(published.id);
  const publicQuestions = (
    await browserRequest(page, "/api/v1/learning/community?language=ja")
  ).body.questions;
  expect(
    publicQuestions.filter(
      (question: { title: string }) => question.title === title,
    ),
  ).toHaveLength(1);
  expect((await submitFixtureAnswer(page, published.id)).xpAwarded).toBe(0);
  expect(
    (await browserRequest(page, "/api/v1/learning/progress")).body.totalXp,
  ).toBe(0);

  const readerContext = await browser.newContext({
    viewport: testInfo.project.use.viewport,
    isMobile: testInfo.project.use.isMobile,
    hasTouch: testInfo.project.use.hasTouch,
  });
  await readerContext.route("**/*", (route) =>
    new URL(route.request().url()).origin === origin
      ? route.continue()
      : route.abort("blockedbyclient"),
  );
  const reader = await readerContext.newPage();
  try {
    await reader.addInitScript(() => {
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: undefined,
      });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            (
              window as unknown as { copiedQuestionLink: string }
            ).copiedQuestionLink = value;
          },
        },
      });
    });
    await prepareLearningAccount(
      reader,
      readerContext,
      testInfo.project.name,
      "community",
      "reader",
    );
    const batchResponse = learningResponse(reader, "/feed/batches", "POST");
    await reader.goto(`${origin}/`);
    const batch = await checkedJson(await batchResponse);
    expect(batch.communityQuestion?.id).toBe(published.id);
    await reader.goto(`${origin}/questions/${published.id}`);
    const card = reader.locator(`[data-question-id="${published.id}"]`);
    await openQuestionDetails(card);
    await expect(card.getByText(title, { exact: true }).last()).toBeVisible();
    await closeLearningDetails(card);
    const likedResponse = learningResponse(
      reader,
      `/questions/${published.id}/like`,
      "PUT",
    );
    await card.getByRole("button", { name: /^いいね/ }).click();
    expect(await checkedJson(await likedResponse)).toMatchObject({
      liked: true,
      likes: 1,
    });
    const repeatedLike = await browserRequest(
      reader,
      `/api/v1/learning/questions/${published.id}/like`,
      "PUT",
      { liked: true },
    );
    expect(repeatedLike.body.likes).toBe(1);
    const savedResponse = learningResponse(
      reader,
      `/questions/${published.id}/save`,
      "PUT",
    );
    await card.getByRole("button", { name: /^保存/ }).click();
    expect((await checkedJson(await savedResponse)).saved).toBe(true);
    expect(
      (
        await browserRequest(reader, "/api/v1/learning/saved")
      ).body.questions.some(
        (value: { id: string }) => value.id === published.id,
      ),
    ).toBe(true);
    await card.getByRole("button", { name: "コメント", exact: true }).click();
    await reader
      .getByLabel("コメントを書く", { exact: true })
      .fill("具体例があると理解しやすいです。");
    const commentResponse = learningResponse(
      reader,
      `/questions/${published.id}/comments`,
      "POST",
    );
    await reader
      .getByRole("button", { name: "コメントを投稿", exact: true })
      .click();
    const comment = await checkedJson(await commentResponse);
    await expect(
      reader.getByText("具体例があると理解しやすいです。", { exact: true }),
    ).toBeVisible();
    await card
      .getByRole("button", { name: "コメントを閉じる", exact: true })
      .click();
    await card.getByRole("button", { name: "共有", exact: true }).click();
    await expect
      .poll(() =>
        reader.evaluate(
          () =>
            (window as unknown as { copiedQuestionLink?: string })
              .copiedQuestionLink,
        ),
      )
      .toBe(`${origin}/questions/${published.id}`);
    await expectUsableViewport(reader);
    const publicQuestion = await context.request.get(
      `${origin}/api/v1/learning/questions/${published.id}`,
    );
    expect(publicQuestion.ok()).toBe(true);
    expect(JSON.stringify(await publicQuestion.json())).not.toContain(
      "@example.test",
    );
    const deletion = await browserRequest(
      reader,
      `/api/v1/learning/questions/${published.id}/comments/${comment.id}`,
      "DELETE",
    );
    expect(deletion.status).toBe(204);
    expect(
      (
        await browserRequest(
          reader,
          `/api/v1/learning/questions/${published.id}/comments`,
        )
      ).body.comments,
    ).toEqual([]);
  } finally {
    await readerContext.close();
  }
});

test("learning outage: setup and assessment errors recover without losing an answer or awarding XP", async ({
  page,
  context,
}, testInfo) => {
  await prepareLearningAccount(
    page,
    context,
    testInfo.project.name,
    "recovery",
  );
  await page.route("**/api/v1/learning/feed/batches", (route) =>
    route.fulfill({
      status: 503,
      json: { code: "AI_NOT_CONFIGURED", message: "Fixture AI setup pending" },
    }),
  );
  await page.goto("/");
  await expect(page.locator(".feed-status")).toContainText("Gemini");
  await expect(page.locator("[data-question-id]").first()).toBeVisible();
  await page.unroute("**/api/v1/learning/feed/batches");
  const batchResponse = learningResponse(page, "/feed/batches", "POST");
  await page
    .locator(".feed-status")
    .getByRole("button", { name: "再試行" })
    .click();
  const batch = await checkedJson(await batchResponse);
  await expect(page.locator(".feed-status button")).toHaveCount(0);
  const question = batch.questions[0];
  const card = page.locator(`[data-question-id="${question.id}"]`).first();
  const answer =
    "fixture-pass: Each request is independent and must carry valid credentials.";
  const field = await explanationField(card);
  await field.fill(answer);
  await page.route(
    `**/api/v1/learning/questions/${question.id}/attempts`,
    (route) =>
      route.fulfill({
        status: 503,
        json: { code: "AI_UNAVAILABLE", message: "Fixture assessment outage" },
      }),
  );
  const requestIds: string[] = [];
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname ===
      `/api/v1/learning/questions/${question.id}/attempts`
    )
      requestIds.push(request.postDataJSON().requestId);
  });
  await card
    .getByRole("button", { name: "理解度をチェック", exact: true })
    .click();
  await expect(card.getByRole("alert")).toBeVisible();
  await expect(field).toHaveValue(answer);
  expect(
    (await browserRequest(page, "/api/v1/learning/progress")).body.totalXp,
  ).toBe(0);
  expect(
    (await browserRequest(page, "/api/v1/learning/reviews")).body.questions,
  ).toEqual([]);
  await page.unroute(`**/api/v1/learning/questions/${question.id}/attempts`);
  const recoveredResponse = learningResponse(
    page,
    `/questions/${question.id}/attempts`,
    "POST",
  );
  await card
    .getByRole("button", { name: "理解度をチェック", exact: true })
    .click();
  expect((await checkedJson(await recoveredResponse)).score).toBe(9);
  expect(requestIds).toHaveLength(2);
  expect(requestIds[0]).toBe(requestIds[1]);
  expect(
    (await browserRequest(page, "/api/v1/learning/progress")).body.totalXp,
  ).toBe(20);
  await expectUsableViewport(page);
});

test("language settings: skeleton feed, profile save and restoration on a clean device", async ({
  page,
  context,
}, testInfo) => {
  await prepareLearningAccount(
    page,
    context,
    testInfo.project.name,
    "recovery",
    "reader",
  );
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const firstLoad = (url: URL) =>
    url.pathname === "/api/v1/learning/feed/pool" ||
    url.pathname === "/api/v1/learning/daily";
  await page.route(firstLoad, async (route) => {
    await waiting;
    await route.continue();
  });
  const initial = learningResponse(page, "/feed/batches", "POST");
  await page.goto("/");
  try {
    await expect(
      page.locator(".feed-loading app-loading-skeleton"),
    ).toBeVisible();
    await expect(
      page.locator('.feed-loading [aria-hidden="true"]'),
    ).toBeVisible();
    await expect(page.locator(".feed-controls")).toHaveCount(0);
    await expect(
      page.locator('.header-actions [aria-label="Switch to English"]'),
    ).toHaveCount(0);
    await expect(page.locator(".question-card")).toHaveCount(0);
    if (testInfo.project.name === "desktop-chromium") {
      const content = await page.locator(".content").boundingBox();
      const skeleton = await page.locator(".feed-loading").boundingBox();
      expect(skeleton!.width).toBeLessThanOrEqual(760);
      expect(
        Math.abs(
          skeleton!.x + skeleton!.width / 2 - content!.x - content!.width / 2,
        ),
      ).toBeLessThan(2);
    }
    await expectUsableViewport(page);
    await page.screenshot({
      path: testInfo.outputPath("feed-skeleton.png"),
      fullPage: true,
    });
  } finally {
    release();
  }
  const initialBatch = await checkedJson(await initial);
  expect(initialBatch.questions).toHaveLength(5);
  await expect(
    page
      .locator(`[data-question-id="${initialBatch.questions[0].id}"]`)
      .first(),
  ).toBeAttached();
  expect(await page.locator(".question-card").count()).toBeGreaterThanOrEqual(
    10,
  );
  await page.unroute(firstLoad);
  let releaseProgress!: () => void;
  const pendingProgress = new Promise<void>((resolve) => {
    releaseProgress = resolve;
  });
  await page.route("**/api/v1/learning/progress", async (route) => {
    await pendingProgress;
    await route.continue();
  });
  const progressResponse = learningResponse(page, "/progress", "GET");
  await openProfile(page);
  try {
    await expect(
      page.locator(".profile-panel app-loading-skeleton").first(),
    ).toBeVisible();
    await page
      .locator(".profile-panel app-loading-skeleton")
      .first()
      .scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight,
      ),
    ).toBe(true);
  } finally {
    releaseProgress();
  }
  expect((await progressResponse).ok()).toBe(true);
  await page.unroute("**/api/v1/learning/progress");
  await openSettings(page);
  const saved = learningResponse(page, "/preferences/language", "PATCH");
  await page.getByRole("radio", { name: "English", exact: true }).check();
  expect((await checkedJson(await saved)).preferences.language).toBe("en");
  await expect(
    page.getByRole("heading", { name: "App settings", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    localStorage.removeItem("whylint-language");
    localStorage.removeItem("whylint-onboarding-v1");
    localStorage.removeItem("whylint-onboarding-v2");
  });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await openSettings(page, "en");
  await expect(
    page.getByRole("radio", { name: "English", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("heading", { name: "App settings", exact: true }),
  ).toBeVisible();
});

test("guest: skip setup, answer instantly without signing in, and get invited after three taps", async ({
  page,
}, testInfo) => {
  await page.goto("/onboarding");
  const poolResponse = learningResponse(page, "/feed/pool", "GET");
  await page.getByRole("button", { name: /スキップしてすぐ始める/ }).click();
  await expect(page).toHaveURL(`${origin}/`);
  const pool = await checkedJson(await poolResponse);
  expect(pool.questions.length).toBeGreaterThan(0);
  expect(JSON.stringify(pool)).not.toContain("correctOption");
  for (let index = 0; index < 3; index++) {
    const slide = page.locator(".feed-slide").nth(index);
    await slide.evaluate((node) =>
      node.scrollIntoView({ block: "start", behavior: "instant" }),
    );
    const tapResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith("/taps") &&
        response.request().method() === "POST",
    );
    await slide.locator(".quiz-option, button.code-line").first().click();
    const tap = await checkedJson(await tapResponse);
    expect(tap).toMatchObject({ xpAwarded: 0, progress: null });
    await expect(slide.locator(".reveal")).toBeVisible();
  }
  await expect(page.locator(".hud")).toContainText("/3");
  await expect(page.locator(".signin-card")).toHaveCount(1);
  await expect(page.locator(".signin-card a")).toHaveAttribute(
    "href",
    "/login",
  );
  await expectUsableViewport(page);
  await page.screenshot({
    path: testInfo.outputPath("guest-feed.png"),
    fullPage: false,
  });
});
