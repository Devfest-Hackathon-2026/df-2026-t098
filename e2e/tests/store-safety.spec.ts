import { randomUUID } from "node:crypto";
import { test, expect, browserRequest, completeOnboarding, learner, openAccountSettings, openProfile, openSettings, origin } from "./fixtures";
import { checkedJson, learningResponse, prepareLearningAccount } from "./learning-fixtures";

test("legal links and the support contact come from configuration on sign-in, sign-up and Settings", async ({
  page,
}) => {
  for (const path of ["/login", "/signup"]) {
    await page.goto(path);
    const legal = page.getByRole("navigation", { name: "法的情報" });
    await expect(
      legal.getByRole("link", { name: "プライバシーポリシー", exact: true }),
    ).toHaveAttribute("href", "https://legal.example.test/whylint/privacy");
    await expect(
      legal.getByRole("link", { name: "利用規約", exact: true }),
    ).toHaveAttribute("href", "https://legal.example.test/whylint/terms");
    await expect(
      legal.getByRole("link", { name: "利用規約", exact: true }),
    ).toHaveAttribute("rel", /noopener/);
  }
  await completeOnboarding(page);
  await page.goto("/");
  await openSettings(page);
  await expect(
    page.getByRole("link", { name: "プライバシーポリシー", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "support@example.test", exact: true }),
  ).toHaveAttribute("href", "mailto:support@example.test");
});

test("a learner confirms and deletes their account from Settings", async ({ page }) => {
  const account = learner();
  await page.goto("/login");
  const signup = await browserRequest(page, "/api/v1/auth/signup", "POST", account);
  expect(signup.status).toBe(201);
  await completeOnboarding(page);
  await page.goto("/");
  await openProfile(page);
  await expect(page.getByText(`@${account.username}`)).toBeVisible();

  const appSettings = page.getByRole("heading", { name: "アプリ設定", exact: true });
  const card = page.getByRole("button", { name: "アカウント設定", exact: true });
  const deleteAccount = page.getByRole("button", { name: "アカウントを削除", exact: true });
  await expect(appSettings).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "今日の目標", exact: true })).toBeVisible();
  await openSettings(page);
  await expect(appSettings).toBeVisible();
  await expect(page.getByRole("heading", { name: "今日の目標", exact: true })).toHaveCount(0);
  await expect(deleteAccount).toHaveCount(0);
  await openAccountSettings(page);
  await expect(appSettings).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "アカウント設定", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "設定に戻る", exact: true }).click();
  await expect(card).toBeFocused();
  await expect(appSettings).toBeVisible();
  await openAccountSettings(page);
  await page.getByRole("button", { name: "アカウントを削除", exact: true }).click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toContainText("元に戻せません");
  await confirmation.getByRole("button", { name: "キャンセル", exact: true }).click();
  expect((await browserRequest(page, "/api/v1/auth/me")).status).toBe(200);

  await page.getByRole("button", { name: "アカウントを削除", exact: true }).click();
  const deleted = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/v1/auth/me" &&
      response.request().method() === "DELETE",
  );
  await page.getByTestId("confirm-delete-account").click();
  expect((await deleted).status()).toBe(204);
  await expect(page.getByTestId("account-deleted")).toHaveText("アカウントを削除しました。");
  await expect(page.getByRole("link", { name: "ログイン", exact: true })).toBeVisible();

  expect((await browserRequest(page, "/api/v1/auth/me")).status).toBe(401);
  const again = await browserRequest(page, "/api/v1/auth/password/login", "POST", {
    identifier: account.email,
    password: account.password,
  });
  expect(again.status).toBe(401);
});

test("a learner reports a comment, blocks its author, and unblocks them from Settings", async ({
  page,
  context,
  browser,
}, testInfo) => {
  const author = await prepareLearningAccount(page, context, testInfo.project.name, "safety");
  const poolResponse = learningResponse(page, "/feed/pool", "GET");
  await page.goto("/");
  const pool = await checkedJson(await poolResponse);
  const question = pool.questions[0];
  const suffix = randomUUID().slice(0, 8);
  const spam = `fixture spam ${suffix}`;
  const rude = `fixture rude ${suffix}`;
  for (const text of [spam, rude]) {
    const posted = await browserRequest(
      page,
      `/api/v1/learning/questions/${question.id}/comments`,
      "POST",
      { text },
    );
    expect(posted.status).toBe(201);
  }

  const readerContext = await browser.newContext();
  const reader = await readerContext.newPage();
  try {
    await prepareLearningAccount(reader, readerContext, testInfo.project.name, "safety", "reader");
    await reader.goto(`${origin}/questions/${question.id}`);
    const card = reader.locator(`[data-question-id="${question.id}"]`);
    await card.getByRole("button", { name: "コメント", exact: true }).click();
    const panel = reader.getByRole("dialog", { name: "コメント", exact: true });
    await expect(panel.getByText(spam, { exact: true })).toBeVisible();
    await expect(panel.getByText(rude, { exact: true })).toBeVisible();

    // Report: the form asks for a reason, the server records it, the comment disappears.
    const entry = (text: string) =>
      panel.locator(".discussion-entry").filter({ hasText: text });
    await entry(spam).getByTestId("report-comment").click();
    await panel.getByLabel("報告の理由", { exact: true }).selectOption("spam");
    const reported = reader.waitForResponse(
      (response) =>
        /\/comments\/[0-9a-f-]+\/reports$/.test(new URL(response.url()).pathname) &&
        response.request().method() === "POST",
    );
    await panel.getByRole("button", { name: "報告を送信", exact: true }).click();
    expect((await reported).status()).toBe(201);
    await expect(panel.getByTestId("discussion-notice")).toContainText("報告を受け付けました");
    await expect(panel.getByText(spam, { exact: true })).toHaveCount(0);
    await expect(panel.getByText(rude, { exact: true })).toBeVisible();

    // Block: needs a confirmation, then every comment by that learner is hidden.
    await entry(rude).getByTestId("block-user").click();
    await expect(panel.getByTestId("block-confirm")).toContainText("ブロックしますか");
    const blocked = reader.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/v1/learning/blocks/${author.userId}` &&
        response.request().method() === "PUT",
    );
    await panel.getByTestId("confirm-block").click();
    expect((await blocked).status()).toBe(200);
    await expect(panel.getByText(rude, { exact: true })).toHaveCount(0);
    await expect(panel.getByTestId("discussion-notice")).toContainText("ブロックしました");
    const hidden = await browserRequest(reader, `/api/v1/learning/questions/${question.id}/comments`);
    expect(JSON.stringify(hidden.body)).not.toContain(suffix);

    // The block is listed in Account settings and can be lifted.
    await panel.getByRole("button", { name: "コメントを閉じる", exact: true }).click();
    await reader.goto("/");
    await openProfile(reader);
    await openAccountSettings(reader);
    const list = reader.getByTestId("blocked-list");
    await expect(list).toContainText(author.username);
    await list.getByRole("button", { name: `${author.username}のブロックを解除` }).click();
    await expect(list).toContainText("ブロックしているユーザーはいません");
    const restored = await browserRequest(reader, `/api/v1/learning/questions/${question.id}/comments`);
    expect(JSON.stringify(restored.body)).toContain(rude);
    // The reported comment stays hidden for the reporter.
    expect(JSON.stringify(restored.body)).not.toContain(spam);
  } finally {
    await readerContext.close();
  }
});
