import { test, expect, openProfile } from "./fixtures";
import { prepareLearningAccount } from "./learning-fixtures";

test("unknown pages and invalid or missing question links let learners return to the feed", async ({
  page,
}) => {
  await page.goto("/no-such-page");
  await expect(page.getByRole("heading", { name: "ページが見つかりません" })).toBeVisible();
  await expect(page.locator("app-loading-skeleton")).toHaveCount(0);
  for (const id of ["not-a-question-id", "00000000-0000-4000-8000-000000000099"]) {
    await page.goto(`/questions/${id}`);
    await expect(page.getByRole("heading", { name: "問題が見つかりません" })).toBeVisible();
    await expect(page.locator("app-loading-skeleton")).toHaveCount(0);
  }
  await page.getByRole("link", { name: "フィードに戻る", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
});

test("onboarding starts each step at its heading and wraps a long technology", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/onboarding");
  await page
    .getByRole("button", { name: "バックエンド・API", exact: true })
    .click();
  await page.getByRole("button", { name: "次へ", exact: true }).click();
  await expect(page.locator("h1")).toBeFocused();
  expect(await page.evaluate(() => scrollY)).toBe(0);
  const technology = "A".repeat(60);
  await page.getByRole("searchbox").fill(technology);
  await page.locator(".custom-add").click();
  await expect(page.locator(".selected-technologies")).toContainText(
    technology,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "戻る", exact: true }).click();
  await expect(page.locator("h1")).toBeFocused();
  expect(await page.evaluate(() => scrollY)).toBe(0);
});

test("a shared lesson can recover when account restoration is unavailable", async ({
  page,
}) => {
  let unavailable = true;
  await page.route("**/api/v1/auth/me", (route) =>
    unavailable
      ? route.fulfill({ status: 503, json: { message: "fixture unavailable" } })
      : route.continue(),
  );
  await page.goto("/questions/894a7456-75cf-43c8-bb51-02f6b84a6cc3");
  await expect(page.getByRole("alert")).toContainText(
    "アカウントを確認できませんでした",
  );
  unavailable = false;
  await page.getByRole("button", { name: "再試行", exact: true }).click();
  await expect(page.locator(".question-card")).toBeVisible();
});

test("post drafts survive tabs and saved-question failures have scoped recovery", async ({
  page,
  context,
}, info) => {
  await prepareLearningAccount(page, context, info.project.name, "uiaudit");
  await page.goto("/");
  await page.getByRole("button", { name: "投稿", exact: true }).click();
  await page
    .getByLabel("タイトル", { exact: true })
    .fill("UI audit draft fixture");
  await page
    .getByLabel("質問", { exact: true })
    .fill("Why does this fixture preserve its draft?");
  await page.route("**/api/v1/learning/saved", (route) =>
    route.fulfill({ status: 503, json: { code: "UNAVAILABLE" } }),
  );
  await openProfile(page);
  const saved = page.locator(".saved-section");
  await expect(saved.getByRole("alert")).toBeVisible();
  await expect(
    saved.getByText("また読みたい問題をブックマークしましょう。"),
  ).toHaveCount(0);
  await page.unroute("**/api/v1/learning/saved");
  await saved
    .getByRole("button", { name: "保存した問題を再読み込み", exact: true })
    .click();
  await expect(saved.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "投稿", exact: true }).click();
  await expect(page.getByLabel("タイトル", { exact: true })).toHaveValue(
    "UI audit draft fixture",
  );
  await expect(page.getByLabel("質問", { exact: true })).toHaveValue(
    "Why does this fixture preserve its draft?",
  );
});

test("comments retain a reachable send control in a short viewport", async ({
  page,
  context,
}, info) => {
  await prepareLearningAccount(page, context, info.project.name, "uiaudit");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .locator(".feed-slide")
    .first()
    .getByRole("button", { name: "コメント", exact: true })
    .click();
  const sheet = page.locator("dialog[open]");
  await expect(sheet).toBeVisible();
  await page.setViewportSize({ width: 390, height: 300 });
  const composer = sheet.locator(".comment-composer");
  await composer.evaluate((node) => (node.scrollTop = node.scrollHeight));
  await expect
    .poll(
      async () =>
        (await sheet.locator(".send-comment").boundingBox())!.y +
        (await sheet.locator(".send-comment").boundingBox())!.height,
    )
    .toBeLessThanOrEqual(300);
  await expect(
    sheet.getByRole("button", { name: "コメントを閉じる", exact: true }),
  ).toBeVisible();
});
