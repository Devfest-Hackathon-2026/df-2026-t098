import type { CDPSession, Page } from "@playwright/test";
import { test, expect, origin, openSettings } from "./fixtures";
import { prepareLearningAccount } from "./learning-fixtures";

const sqlQuestionId = "894a7456-75cf-43c8-bb51-02f6b84a6cc3";

async function swipe(
  cdp: CDPSession,
  page: Page,
  x: number,
  y: number,
  distanceY: number,
  distanceX = 0,
  cancel = false,
) {
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  await page.waitForTimeout(40);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: x + distanceX, y: y - distanceY }],
  });
  await page.waitForTimeout(40);
  await cdp.send("Input.dispatchTouchEvent", {
    type: cancel ? "touchCancel" : "touchEnd",
    touchPoints: [],
  });
}

async function expectPage(page: Page, index: number) {
  const slide = page.locator(".feed-slide").nth(index);
  await expect
    .poll(async () =>
      slide.evaluate((node) => {
        const feed = node.closest(".feed-content")!;
        return Math.abs(
          node.getBoundingClientRect().top - feed.getBoundingClientRect().top,
        );
      }),
    )
    .toBeLessThan(1);
}

test("short touch swipes page one lesson and never submit an answer", async ({
  page,
  context,
}, info) => {
  test.skip(
    info.project.name !== "mobile-chromium",
    "Touch paging is the compact mobile interaction",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await prepareLearningAccount(page, context, info.project.name, "paging");
  const response = await context.request.get(
    `${origin}/api/v1/learning/questions/${sqlQuestionId}`,
  );
  const { question } = await response.json();
  await page.route("**/api/v1/learning/daily?*", (route) =>
    route.fulfill({
      json: {
        day: "2026-11-08",
        question,
        solved: 0,
        answered: 0,
        solvers: [],
        you: null,
      },
    }),
  );
  let submitted = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/taps"))
      submitted++;
  });
  await page.goto("/");
  const first = page.locator(".feed-slide").first();
  const answer = first.locator("button.code-line").first();
  await expect(answer).toBeVisible();
  const cdp = await context.newCDPSession(page);
  const box = (await answer.boundingBox())!;
  await swipe(cdp, page, box.x + box.width / 2, box.y + box.height / 2, 40);
  await expectPage(page, 1);
  expect(submitted).toBe(0);

  const feedBox = (await page.locator(".feed-content").boundingBox())!;
  const x = feedBox.x + feedBox.width / 2;
  const y = feedBox.y + feedBox.height / 2;
  await swipe(cdp, page, x, y, -40);
  await expectPage(page, 0);
  await swipe(cdp, page, x, feedBox.y + feedBox.height - 40, 400);
  await expectPage(page, 1);
  expect(submitted).toBe(0);

  const headingBox = (await page
    .locator(".feed-slide")
    .nth(1)
    .locator("h2")
    .first()
    .boundingBox())!;
  const headingX = headingBox.x + headingBox.width / 2;
  const headingY = headingBox.y + Math.min(30, headingBox.height / 2);
  await swipe(cdp, page, headingX, headingY, 40, 0, true);
  await expectPage(page, 1);
  await swipe(cdp, page, headingX, headingY, 2, 60);
  await expectPage(page, 1);
  await swipe(cdp, page, headingX, headingY, 4);
  await expectPage(page, 1);
  expect(submitted).toBe(0);

  await page.setViewportSize({ width: 430, height: 932 });
  await expectPage(page, 1);
  await swipe(cdp, page, x, y, -40);
  await expectPage(page, 0);
  await answer.tap();
  await expect.poll(() => submitted).toBe(1);
  await cdp.detach();
});

test("short phone cards keep their controls beside the lesson", async ({
  page,
  context,
}, info) => {
  test.skip(info.project.name !== "mobile-chromium", "Phone feed layout");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() =>
    localStorage.setItem(
      "whylint-onboarding-v1",
      JSON.stringify({ domain: "frontend", stack: "javascript", onboardingCompleted: true }),
    ),
  );
  const questionIds = [
    "f7937fee-cb4d-4aa8-8400-4f06c629635a",
    "9e683fcb-8946-44b5-b409-d72b5704afc8",
  ];
  let question: { id: string; title: string; format: string };
  await page.route("**/api/v1/learning/daily?*", (route) =>
    route.fulfill({
      json: { day: "2026-11-10", question, solved: 0, answered: 0, solvers: [], you: null },
    }),
  );
  for (const id of questionIds) {
    const response = await context.request.get(`${origin}/api/v1/learning/questions/${id}`);
    expect(response.ok()).toBe(true);
    question = (await response.json()).question;
    await page.goto("/");
    const card = page.locator(".feed-slide").first().locator(".question-card");
    await expect(card).toHaveAttribute("data-question-id", id);
    await expect(card.locator(".format-chip")).toBeVisible();
    await expect(card.locator(".question-credit")).toContainText(question.title);
    if (question.format === "predict_output") await expect(card.locator(".code-head")).toBeVisible();
    await expect.poll(() =>
      card.evaluate((element) => {
        const choices = [...element.querySelectorAll(".quiz-option")].map((option) =>
          option.getBoundingClientRect(),
        );
        const actions = element.querySelector(".card-actions")!.getBoundingClientRect();
        return {
          gap: Math.round(actions.top - Math.max(...choices.map((option) => option.bottom))),
          rows: new Set(choices.map((option) => Math.round(option.top))).size,
        };
      }),
    ).toEqual({ gap: 0, rows: question.format === "true_false" ? 1 : 4 });
  }
});

test("real long lessons stay complete and readable inline across phone sizes", async ({
  page,
  context,
}, info) => {
  test.skip(
    info.project.name !== "mobile-chromium",
    "Inline lesson fitting belongs to the compact mobile feed",
  );
  test.setTimeout(90_000);
  type PublicQuestion = {
    id: string;
    prompt: string;
    code: string | null;
    format: string;
    options: string[];
  };
  const questionIds = [
    "a38732a0-a262-4d1a-a147-5ac2ed078e41",
    "049c78ba-dd8e-411a-9c9e-b61cb638bb21",
    "dba8dd33-3de5-43ed-ae2a-06829199f082",
    sqlQuestionId,
    "e3ed78d5-baa7-4d9b-bfe9-29c7b6834ce2",
    "0e768075-b0e0-4dad-b25f-869e02e373f5",
  ];
  const questions = await Promise.all(
    questionIds.map(async (id) => {
      const response = await context.request.get(
        `${origin}/api/v1/learning/questions/${id}`,
      );
      expect(response.ok()).toBe(true);
      return (await response.json()).question as PublicQuestion;
    }),
  );
  let currentQuestion = questions[0];
  await page.addInitScript(() =>
    localStorage.setItem(
      "whylint-onboarding-v1",
      JSON.stringify({
        domain: "frontend",
        stack: "javascript",
        onboardingCompleted: true,
      }),
    ),
  );
  await page.route("**/api/v1/learning/daily?*", (route) =>
    route.fulfill({
      json: {
        day: "2026-11-09",
        question: currentQuestion,
        solved: 0,
        answered: 0,
        solvers: [],
        you: null,
      },
    }),
  );

  async function expectInlineQuestion(question: PublicQuestion) {
    const card = page.locator(".feed-slide").first().locator(".question-card");
    const stage = card.locator(".question-content");
    await expect(card).toHaveAttribute("data-question-id", question.id);
    await expect(stage.locator("h2")).toHaveText(question.prompt);
    await expect(
      card.locator(".full-question-button, .question-stage-preview"),
    ).toHaveCount(0);
    if (question.format === "spot_bug") {
      await expect(stage.locator("button.code-line")).toHaveCount(
        question.options.length,
      );
      const lines = await stage.locator(".code-line code").allTextContents();
      expect(lines.map((line) => line.trim())).toEqual(
        question.code!.split("\n").map((line) => line.trim()),
      );
    } else {
      await expect(stage.locator(".option-text")).toHaveText(question.options);
      if (question.code)
        await expect(stage.locator("pre code")).toHaveText(question.code);
    }
    await expect
      .poll(
        async () =>
          stage.evaluate((node) => {
            const stage = node as HTMLElement;
            const natural = stage.querySelector<HTMLElement>(
              ".question-stage-natural",
            )!;
            const bounds = stage.getBoundingClientRect();
            const errors: string[] = [];
            if (bounds.height <= 0 || bounds.width <= 0)
              errors.push("empty question stage");
            const scrolls =
              stage
                .closest("app-question-card")
                ?.getAttribute("data-fit-overflow") === "true";
            if (!scrolls && natural.scrollHeight > stage.clientHeight + 2)
              errors.push(
                `lesson height ${natural.scrollHeight} exceeds stage ${stage.clientHeight}`,
              );
            const top = bounds.top - stage.scrollTop;
            const bottom = scrolls ? top + stage.scrollHeight : bounds.bottom;
            for (const element of stage.querySelectorAll<HTMLElement>(
              "h2, pre, .code-line, .quiz-option, .option-text",
            )) {
              const box = element.getBoundingClientRect();
              const label = element.className || element.tagName;
              const code = element.matches("pre, .code-line");
              if (
                box.top < top - 2 ||
                box.bottom > bottom + 2 ||
                (!code &&
                  (box.left < bounds.left - 2 || box.right > bounds.right + 2))
              )
                errors.push(`${label} extends outside the question stage`);
              if (element.closest("[inert], [hidden], [aria-hidden='true']"))
                errors.push(`${label} is hidden`);
              if (
                element.clientHeight &&
                element.scrollHeight > element.clientHeight + 2
              )
                errors.push(`${label} clips text vertically`);
              if (
                !code &&
                element.clientWidth &&
                element.scrollWidth > element.clientWidth + 2
              )
                errors.push(`${label} clips text horizontally`);
              const style = getComputedStyle(element);
              if (
                style.display === "none" ||
                style.visibility === "hidden" ||
                box.height <= 0
              )
                errors.push(`${label} is not rendered`);
              if (
                element.matches("h2, .option-text") &&
                Number.parseInt(style.webkitLineClamp, 10) > 0
              )
                errors.push(`${label} clamps text`);
              if (
                element.matches("h2, .option-text") &&
                Number.parseFloat(style.fontSize) < 12.9
              )
                errors.push(`${label} font is below the 13px reading floor`);
              if (
                element.matches("button.code-line, .quiz-option") &&
                box.height < 43.5
              )
                errors.push(`${label} answer target is shorter than 44px`);
            }
            for (const code of stage.querySelectorAll<HTMLElement>("code")) {
              if (Number.parseFloat(getComputedStyle(code).fontSize) < 10.9)
                errors.push("code font is below the 11px reading floor");
            }
            return errors;
          }),
        { message: `complete inline lesson geometry for ${question.id}` },
      )
      .toEqual([]);
    await expectPage(page, 0);
  }

  for (const size of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(size);
    for (const question of questions) {
      currentQuestion = question;
      await page.goto("/");
      await expectInlineQuestion(question);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await openSettings(page);
  await page.getByRole("radio", { name: "さらに大きい", exact: true }).check();
  currentQuestion = questions[0];
  await page.goto("/");
  await expectInlineQuestion(currentQuestion);
});

async function path(cdp: CDPSession, page: Page, points: [number, number][]) {
  const [[x0, y0], ...rest] = points;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: x0, y: y0 }],
  });
  for (const [x, y] of rest) {
    await page.waitForTimeout(16);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y }],
    });
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}

function alignedCard(page: Page) {
  return page.evaluate(() => {
    const feed = document.querySelector(".feed-content")!;
    const top = feed.getBoundingClientRect().top;
    return [...document.querySelectorAll(".feed-slide")].findIndex(
      (slide) => Math.abs(slide.getBoundingClientRect().top - top) < 1,
    );
  });
}

test("thumb arcs page, and a touch during the glide never leaves the feed between cards", async ({
  page,
  context,
}, info) => {
  test.skip(
    info.project.name !== "mobile-chromium",
    "Touch paging is the compact mobile interaction",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await prepareLearningAccount(page, context, info.project.name, "paging-arcs");
  const response = await context.request.get(
    `${origin}/api/v1/learning/questions/0496a538-bc5e-4a4c-afa9-86e3ff19e614`,
  );
  expect(response.ok()).toBe(true);
  const { question } = await response.json();
  await page.route("**/api/v1/learning/daily?*", (route) =>
    route.fulfill({
      json: { day: "2026-11-10", question, solved: 0, answered: 0, solvers: [], you: null },
    }),
  );
  let submitted = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/taps"))
      submitted++;
  });
  await page.goto("/");
  await expect(page.locator(".feed-slide").nth(3)).toBeAttached();
  const cdp = await context.newCDPSession(page);
  const feedBox = (await page.locator(".feed-content").boundingBox())!;
  const x = feedBox.x + feedBox.width * 0.8;
  const y = feedBox.y + feedBox.height * 0.6;

  await path(cdp, page, [
    [x, y],
    [x - 12, y - 4],
    [x - 26, y - 12],
    [x - 40, y - 26],
    [x - 52, y - 44],
    [x - 62, y - 66],
    [x - 70, y - 90],
  ]);
  await expectPage(page, 1);

  await path(cdp, page, [
    [x - 100, y],
    [x - 60, y - 2],
    [x - 20, y - 4],
  ]);
  await expectPage(page, 1);

  const heading = page.locator(".feed-slide").nth(1).locator("h2").first();
  const headingBox = (await heading.boundingBox())!;
  const hx = headingBox.x + headingBox.width / 2;
  const hy = headingBox.y + Math.min(20, headingBox.height / 2);
  await path(cdp, page, [
    [hx, hy + 120],
    [hx, hy + 80],
    [hx, hy + 40],
    [hx, hy],
  ]);
  await page.waitForTimeout(60);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: hx, y: feedBox.y + 20 }],
  });
  await page.waitForTimeout(40);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect.poll(() => alignedCard(page)).toBeGreaterThanOrEqual(1);
  const landed = await alignedCard(page);
  await path(cdp, page, [
    [x, feedBox.y + feedBox.height * 0.3],
    [x, feedBox.y + feedBox.height * 0.3 + 40],
    [x, feedBox.y + feedBox.height * 0.3 + 80],
  ]);
  await expectPage(page, landed - 1);
  expect(submitted).toBe(0);
  await cdp.detach();
});
