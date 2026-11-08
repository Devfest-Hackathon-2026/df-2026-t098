import { type Page, type Request } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { test as base, expect, learner } from "./fixtures";

// The Capacitor shell, simulated in a browser: the native build is served from its own origin and
// calls the API across origins. Capacitor injects window.Capacitor before the app starts; the
// custom platform lets @capacitor/core's web fallbacks stand in for the device plugins.
const nativeOrigin = `http://localhost:${process.env.WHYLINT_E2E_NATIVE_PORT ?? 4400}`;
const apiOrigin = `http://localhost:${process.env.WHYLINT_E2E_BACKEND_PORT ?? 3101}`;

const test = base.extend<{ nativeShell: void }>({
  nativeShell: [
    async ({ context, page }, use) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.name));
      await context.route("**/*", (route) => {
        const origin = new URL(route.request().url()).origin;
        return origin === nativeOrigin || origin === apiOrigin
          ? route.continue()
          : route.abort("blockedbyclient");
      });
      await context.addInitScript(() => {
        const shell = window as unknown as Record<string, unknown>;
        shell["CapacitorCustomPlatform"] = { name: "e2e-native", plugins: {} };
        shell["Capacitor"] = {
          isNativePlatform: () => true,
          getPlatform: () => "e2e-native",
        };
      });
      await use();
      expect(pageErrors, "The native shell should not throw unhandled errors").toEqual([]);
    },
    { auto: true },
  ],
});

const storedToken = (page: Page) =>
  page.evaluate(() => localStorage.getItem("whylint_session-token"));

function apiRequests(page: Page) {
  const requests: Request[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith(`${apiOrigin}/api/`)) requests.push(request);
  });
  return requests;
}

test("native shell: cross-origin sign-up returns a Bearer token, never a cookie, and survives a reload", async ({
  page,
  context,
}) => {
  const account = learner();
  const requests = apiRequests(page);
  await page.goto(`${nativeOrigin}/signup`);
  await expect(page.locator("html")).toHaveClass(/native-app/);
  await expect(page.locator("html")).toHaveAttribute("data-platform", "e2e-native");

  await page.getByLabel("メールアドレス", { exact: true }).fill(account.email);
  await page.getByLabel("ユーザー名", { exact: true }).fill(account.username);
  await page.getByLabel("パスワード", { exact: true }).fill(account.password);
  const signupResponse = page.waitForResponse(
    (value) => new URL(value.url()).pathname === "/api/v1/auth/signup",
  );
  await page.getByRole("button", { name: "アカウントを作成", exact: true }).click();
  const signup = await signupResponse;

  // Every call goes to the API origin, not to the page's own origin.
  expect(signup.url()).toBe(`${apiOrigin}/api/v1/auth/signup`);
  expect(signup.status()).toBe(201);
  expect(signup.request().headers()["origin"]).toBe(nativeOrigin);
  expect(signup.request().headers()["x-whylint-testactor"]).toMatch(/^[0-9a-f-]{36}$/);
  expect(signup.headers()["access-control-allow-origin"]).toBe(nativeOrigin);
  expect(signup.headers()["set-cookie"]).toBeUndefined();
  const preflight = await context.request.fetch(`${apiOrigin}/api/v1/auth/signup`, {
    method: "OPTIONS",
    headers: {
      Origin: nativeOrigin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type,x-whylint-testactor",
    },
  });
  expect(preflight.headers()["access-control-allow-origin"]).toBe(nativeOrigin);
  expect(preflight.headers()["access-control-allow-headers"]).toContain("x-whylint-testactor");
  const body = await signup.json();
  expect(Object.keys(body).sort()).toEqual(["message", "token"]);
  expect(await storedToken(page)).toBe(body.token);
  await expect(page).toHaveURL(`${nativeOrigin}/onboarding`);
  expect((await context.cookies()).some((cookie) => cookie.name === "access_token")).toBe(false);

  // The session was restored with the Bearer token, not with a cookie.
  const me = requests.filter((request) => request.url().endsWith("/api/v1/auth/me")).at(-1);
  expect(me?.headers()["authorization"]).toBe(`Bearer ${body.token}`);

  // Reloading restores the session from the stored token.
  const reloaded = page.waitForResponse((value) => value.url() === `${apiOrigin}/api/v1/auth/me`);
  await page.reload();
  expect((await reloaded).status()).toBe(200);
  await expect(page).toHaveURL(`${nativeOrigin}/onboarding`);
  expect((await context.cookies()).some((cookie) => cookie.name === "access_token")).toBe(false);
});

test("fixture actors keep the production signup quota for repeated requests", async ({
  context,
}) => {
  const options = {
    headers: { Origin: nativeOrigin },
    data: { email: "invalid", username: "fixture_actor", password: "short" },
  };
  // Validation rejects the data, while the real guard still counts every submission.
  for (let attempt = 0; attempt < 10; attempt++) {
    const response = await context.request.post(`${apiOrigin}/api/v1/auth/signup`, options);
    expect(response.status()).toBe(400);
  }
  const blocked = await context.request.post(`${apiOrigin}/api/v1/auth/signup`, options);
  expect(blocked.status()).toBe(429);
  const independent = await context.request.post(`${apiOrigin}/api/v1/auth/signup`, {
    ...options,
    headers: { ...options.headers, "X-WhyLint-TestActor": randomUUID() },
  });
  expect(independent.status()).toBe(400);
});

test("native shell: a signed-in learner answers a question with the Bearer token and logs out", async ({
  page,
  context,
}) => {
  const account = learner();
  const requests = apiRequests(page);
  await context.addInitScript(() =>
    localStorage.setItem(
      "whylint-onboarding-v1",
      JSON.stringify({
        domain: "frontend",
        stack: "javascript",
        onboardingCompleted: true,
      }),
    ),
  );
  await page.goto(`${nativeOrigin}/signup`);
  await page.getByLabel("メールアドレス", { exact: true }).fill(account.email);
  await page.getByLabel("ユーザー名", { exact: true }).fill(account.username);
  await page.getByLabel("パスワード", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "アカウントを作成", exact: true }).click();
  await expect.poll(() => storedToken(page)).not.toBeNull();
  const token = (await storedToken(page)) as string;

  const pool = page.waitForResponse((value) => value.url().includes("/api/v1/learning/feed/pool"));
  await page.goto(`${nativeOrigin}/`);
  expect((await pool).status()).toBe(200);
  const option = page.locator(".quiz-option").first();
  await expect(option).toBeVisible();
  const tap = page.waitForResponse((value) =>
    /\/api\/v1\/learning\/questions\/[^/]+\/taps$/.test(value.url()),
  );
  await option.click();
  const tapResponse = await tap;
  expect(tapResponse.status()).toBe(200);
  expect(tapResponse.request().headers()["authorization"]).toBe(`Bearer ${token}`);
  expect(tapResponse.request().headers()["origin"]).toBe(nativeOrigin);
  const graded = await tapResponse.json();
  expect(typeof graded.correct).toBe("boolean");
  expect(typeof graded.xpAwarded).toBe("number");

  // Logging out revokes the session on the server and forgets the token on the device.
  await page.getByRole("button", { name: "プロフィール", exact: true }).first().click();
  const logout = page.waitForResponse((value) => value.url() === `${apiOrigin}/api/v1/auth/logout`);
  await page.getByRole("button", { name: "ログアウト", exact: true }).click();
  expect((await logout).status()).toBe(204);
  await expect.poll(() => storedToken(page)).toBeNull();
  const revoked = await context.request.get(`${apiOrigin}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(revoked.status()).toBe(401);
  expect(requests.some((request) => request.url().startsWith(nativeOrigin))).toBe(false);
});
