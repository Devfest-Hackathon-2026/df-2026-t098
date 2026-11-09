import type { Browser } from "@playwright/test";
import { test, expect, browserRequest, origin } from "./fixtures";
import {
  checkedJson,
  explanationField,
  openQuestionDetails,
  expectUsableViewport,
  learningResponse,
  prepareLearningAccount,
} from "./learning-fixtures";

async function correctOption(
  browser: Browser,
  questionId: string,
): Promise<number> {
  const guest = await browser.newContext();
  try {
    const response = await guest.request.post(
      `${origin}/api/v1/learning/questions/${questionId}/taps`,
      { headers: { Origin: origin }, data: { choice: 0 } },
    );
    expect(response.ok()).toBe(true);
    return (await response.json()).correctOption;
  } finally {
    await guest.close();
  }
}

test("social learning: publish an explanation, reply, vote Helpful, visit its creator and report a question", async ({
  page,
  context,
  browser,
}, testInfo) => {
  const creator = await prepareLearningAccount(
    page,
    context,
    testInfo.project.name,
    "social",
  );
  const poolResponse = learningResponse(page, "/feed/pool", "GET");
  await page.goto("/");
  const pool = await checkedJson(await poolResponse);
  let question = pool.questions[0];
  for (const candidate of pool.questions) {
    const existing = await browserRequest(
      page,
      `/api/v1/learning/questions/${candidate.id}/comments`,
    );
    if (!existing.body.comments.length) {
      question = candidate;
      break;
    }
  }
  const card = page.locator(`[data-question-id="${question.id}"]`).first();
  const correct = await correctOption(browser, question.id);
  const tapped = learningResponse(
    page,
    `/questions/${question.id}/taps`,
    "POST",
  );
  await card.locator(".quiz-option, button.code-line").nth(correct).click();
  expect((await checkedJson(await tapped)).correct).toBe(true);
  const answer =
    "fixture-pass: Each independent request carries credentials that the server can verify.";
  await (await explanationField(card)).fill(answer);
  const graded = learningResponse(
    page,
    `/questions/${question.id}/attempts`,
    "POST",
  );
  await card
    .getByRole("button", { name: "理解度をチェック", exact: true })
    .click();
  expect((await checkedJson(await graded)).passed).toBe(true);

  const before = await browserRequest(
    page,
    `/api/v1/learning/questions/${question.id}/comments`,
  );
  expect(before.body.comments).toEqual([]);
  await card
    .getByRole("button", { name: "自分の説明を共有", exact: true })
    .click();
  const editor = card.getByTestId("share-explanation");
  await expect(editor.getByLabel("共有する説明", { exact: true })).toHaveValue(
    answer,
  );
  const explanation =
    "名前を付けた値は再利用できます。自分の言葉で整理した説明です。";
  await editor.getByLabel("共有する説明", { exact: true }).fill(explanation);
  const published = learningResponse(
    page,
    `/questions/${question.id}/comments`,
    "POST",
  );
  await editor.getByRole("button", { name: "説明を公開", exact: true }).click();
  const post = await checkedJson(await published);
  expect(post).toMatchObject({
    text: explanation,
    kind: "explanation",
    parentId: null,
  });
  const discussion = page.getByRole("dialog", {
    name: "コメント",
    exact: true,
  });
  await expect(
    discussion.getByText(explanation, { exact: true }),
  ).toBeVisible();
  await discussion
    .getByRole("button", { name: "コメントを閉じる", exact: true })
    .click();
  await openQuestionDetails(card);
  const references = card.getByTestId("question-references");
  await expect(references.getByRole("link").first()).toHaveAttribute(
    "href",
    /^https:\/\//,
  );

  await card.getByText("問題を報告", { exact: true }).click();
  const report = card.getByTestId("report-question");
  await report
    .getByLabel("報告の理由", { exact: true })
    .selectOption("unclear");
  await report
    .getByLabel("補足（任意）", { exact: true })
    .fill("もう少し具体的な例があると助かります。");
  const reported = learningResponse(
    page,
    `/questions/${question.id}/reports`,
    "POST",
  );
  await report.getByRole("button", { name: "報告を送信", exact: true }).click();
  expect((await checkedJson(await reported)).status).toBe("open");

  const readerContext = await browser.newContext();
  const reader = await readerContext.newPage();
  try {
    await prepareLearningAccount(
      reader,
      readerContext,
      testInfo.project.name,
      "social",
      "reader",
    );
    await reader.goto(`${origin}/questions/${question.id}`);
    const readerCard = reader.locator(`[data-question-id="${question.id}"]`);
    await readerCard
      .getByRole("button", { name: "コメント", exact: true })
      .click();
    const panel = reader.getByRole("dialog", { name: "コメント", exact: true });
    const entry = panel.locator(`[data-comment-id="${post.id}"]`);
    await expect(entry.getByText(explanation, { exact: true })).toHaveCount(0);
    await entry.getByRole("button", { name: /答えが含まれています/ }).click();
    await expect(entry.getByText(explanation, { exact: true })).toBeVisible();
    const voted = learningResponse(
      reader,
      `/questions/${question.id}/comments/${post.id}/helpful`,
      "PUT",
    );
    await entry
      .getByRole("button", { name: "参考になった", exact: true })
      .click();
    expect((await checkedJson(await voted)).helpful).toBe(true);
    await entry.getByRole("button", { name: "返信", exact: true }).click();
    const reply = "具体例のおかげで理解できました。ありがとうございます。";
    await panel.getByLabel("コメントを書く", { exact: true }).fill(reply);
    const replied = learningResponse(
      reader,
      `/questions/${question.id}/comments`,
      "POST",
    );
    await panel
      .getByRole("button", { name: "コメントを投稿", exact: true })
      .click();
    expect((await checkedJson(await replied)).parentId).toBe(post.id);
    await expect(panel.getByText(reply, { exact: true })).toBeVisible();
    await entry
      .getByRole("link", { name: creator.username, exact: true })
      .click();
    await expect(reader).toHaveURL(`${origin}/creators/${creator.userId}`);
    await expect(
      reader.getByRole("heading", { name: creator.username, exact: true }),
    ).toBeVisible();
    await expect(reader.getByText(explanation, { exact: true })).toBeVisible();
    const profile = await browserRequest(
      reader,
      `/api/v1/learning/creators/${creator.userId}`,
    );
    expect(profile.body.counts).toMatchObject({ explanations: 1, helpful: 1 });
    const serialized = JSON.stringify(profile.body);
    expect(serialized).not.toContain("@example.test");
    expect(serialized).not.toContain(answer);
    expect(serialized).not.toContain("password");
    await expectUsableViewport(reader);
    await reader.screenshot({
      path: testInfo.outputPath("creator-profile.png"),
      fullPage: true,
    });
  } finally {
    await readerContext.close();
  }
});

test("learning regressions: beginner pool, retained tap state, one panel per instance and latest review replay", async ({
  page,
  context,
  browser,
}, testInfo) => {
  await prepareLearningAccount(
    page,
    context,
    testInfo.project.name,
    "regressions",
  );
  const poolResponse = learningResponse(page, "/feed/pool", "GET");
  await page.goto("/");
  const pool = await checkedJson(await poolResponse);
  expect(pool.questions.length).toBeGreaterThan(0);
  expect(
    pool.questions.every(
      (question: { difficulty: string }) => question.difficulty === "beginner",
    ),
  ).toBe(true);
  const question = pool.questions[0];
  const card = page.locator(`[data-question-id="${question.id}"]`).first();
  const correct = await correctOption(browser, question.id);
  const wrong = (correct + 1) % question.options.length;
  const tapped = learningResponse(
    page,
    `/questions/${question.id}/taps`,
    "POST",
  );
  await card.locator(".quiz-option, button.code-line").nth(wrong).click();
  expect((await checkedJson(await tapped)).correct).toBe(false);
  await expect(page.locator(`[data-question-id="${question.id}"]`)).toHaveCount(
    2,
  );
  await card.getByRole("button", { name: "コメント", exact: true }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(1);
  expect(
    await page.evaluate(() => {
      const ids = [...document.querySelectorAll("[id]")].map((node) => node.id);
      return ids.length === new Set(ids).size;
    }),
  ).toBe(true);
  await page
    .getByRole("button", { name: "コメントを閉じる", exact: true })
    .click();
  await page.getByRole("button", { name: "プロフィール", exact: true }).click();
  await page.getByRole("button", { name: "フィード", exact: true }).click();
  const restored = page.locator(`[data-question-id="${question.id}"]`).first();
  const fullQuestion = restored.locator(".full-question-button");
  if (await fullQuestion.isVisible()) await fullQuestion.click();
  await expect(restored.locator(".reveal:visible")).toBeVisible();
  await expect(
    restored.locator(
      ".quiz-option:not(:disabled), button.code-line:not(:disabled)",
    ),
  ).toHaveCount(0);
  const reviewed = await browserRequest(
    page,
    `/api/v1/learning/questions/${question.id}/taps`,
    "POST",
    { choice: correct },
  );
  expect(reviewed.body).toMatchObject({ correct: true, review: true });
  const replayed = await browserRequest(
    page,
    `/api/v1/learning/questions/${question.id}/taps`,
    "POST",
    { choice: correct },
  );
  expect(replayed.body).toMatchObject({
    correct: true,
    choice: correct,
    xpAwarded: 0,
  });
});
