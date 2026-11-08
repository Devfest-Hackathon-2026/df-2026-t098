import { createHmac, randomUUID } from "node:crypto";
import type { BrowserContext, Locator, Page, Response } from "@playwright/test";
import { browserRequest, completeOnboarding, expect, origin } from "./fixtures";

interface FixtureAccount {
  userId: string;
  sessionId: string;
  username: string;
}
const {
  accountFor,
}: {
  accountFor: (
    project: string,
    scenario: string,
    role?: string,
  ) => FixtureAccount;
} = require("../scripts/learning-accounts.cjs");

export const learningPreferences = {
  interests: ["backend", "security"],
  technologies: ["TypeScript", "NestJS"],
  difficulty: "beginner",
};

export async function prepareLearningAccount(
  page: Page,
  context: BrowserContext,
  project: string,
  scenario: string,
  role = "learner",
) {
  const account = accountFor(project, scenario, role);
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const content = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: account.userId, sid: account.sessionId, iat: now, exp: now + 3600 })}`;
  const signature = createHmac(
    "sha256",
    "whylint-browser-fixture-jwt-secret-never-for-deployment",
  )
    .update(content)
    .digest("base64url");
  // This session exists only in the disposable database. Keep its cookie in memory.
  await context.addCookies([
    {
      name: "access_token",
      value: `${content}.${signature}`,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
  ]);
  await completeOnboarding(page);
  const response = await context.request.put(
    `${origin}/api/v1/learning/preferences`,
    {
      headers: { Origin: origin },
      data: learningPreferences,
    },
  );
  expect(response.ok()).toBe(true);
  const preferences = (await response.json()).preferences;
  expect(preferences.interests).toEqual(learningPreferences.interests);
  expect([...preferences.technologies].sort()).toEqual(
    [...learningPreferences.technologies].sort(),
  );
  expect(preferences.difficulty).toBe(learningPreferences.difficulty);
  return account;
}

export function learningResponse(
  page: Page,
  pathname: string,
  method?: string,
) {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/v1/learning${pathname}` &&
      (method === undefined || response.request().method() === method),
  );
}

export async function checkedJson(response: Response) {
  expect(response.ok()).toBe(true);
  return response.json();
}

export async function submitFixtureAnswer(
  page: Page,
  questionId: string,
  answer = "fixture-pass: independent requests each require verification of credentials.",
) {
  const response = await browserRequest(
    page,
    `/api/v1/learning/questions/${questionId}/attempts`,
    "POST",
    {
      requestId: randomUUID(),
      answer,
    },
  );
  expect([200, 201]).toContain(response.status);
  return response.body;
}

export async function expectUsableViewport(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

/** Opens the optional "Explain why" box on a tap-quiz card and returns its textarea. */
export async function explanationField(card: Locator) {
  const open = card.getByRole("button", {
    name: /なぜ？を説明する|Explain why/,
  });
  if (await open.count()) await open.click();
  const field = card.locator('textarea[id^="answer-"]');
  await expect(field).toBeVisible();
  return field;
}

/** Mobile supporting material lives in the question's focused detail sheet. */
export async function openQuestionDetails(card: Locator) {
  await card.waitFor({ state: "visible" });
  const button = card.getByRole("button", { name: /問題の詳細|Question details/, exact: true });
  if (await button.count()) await button.click();
}

export async function closeLearningDetails(card: Locator) {
  const close = card.getByRole("button", { name: /学習の詳細を閉じる|Close learning details/, exact: true });
  if (await close.count()) await close.click();
}

/** Bounding box once a transition has finished (two equal readings 50ms apart). */
export async function settledBox(locator: Locator) {
  let previous = await locator.boundingBox();
  for (let attempt = 0; attempt < 40; attempt++) {
    await locator.page().waitForTimeout(50);
    const next = await locator.boundingBox();
    if (JSON.stringify(next) === JSON.stringify(previous)) return next;
    previous = next;
  }
  return previous;
}
