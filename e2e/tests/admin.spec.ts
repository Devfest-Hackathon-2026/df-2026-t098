import { expect, test } from "@playwright/test";

const report = {
  id: "00000000-0000-4000-8000-000000000001",
  type: "question",
  reason: "incorrect",
  details: "The explanation needs a correction.",
  status: "open",
  created_at: "2026-11-10T02:00:00.000Z",
  question_id: "00000000-0000-4000-8000-000000000002",
  question_title: "Fixture question",
  question_prompt: "Why does this fixture behave this way?",
  comment_text: null,
  reporter: "learner",
};

test("an admin can sign in, resolve, and reopen a report", async ({ page }) => {
  let signedIn = false;
  let status = "open";
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill(
      signedIn
        ? {
            status: 200,
            json: {
              id: "fixture",
              email: "admin@example.test",
              name: null,
              avatarUrl: null,
              username: "admin",
            },
          }
        : { status: 401, json: {} },
    ),
  );
  await page.route("**/api/v1/auth/password/login", (route) => {
    signedIn = true;
    return route.fulfill({ status: 200, json: {} });
  });
  await page.route("**/api/v1/admin/reports**", (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "PATCH") {
      status = url.pathname.endsWith("/reopen") ? "open" : "resolved";
      return route.fulfill({ status: 200, json: { status } });
    }
    return route.fulfill({
      status: 200,
      json: {
        reports:
          url.searchParams.get("status") === status
            ? [{ ...report, status }]
            : [],
        hasMore: false,
      },
    });
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.getByLabel("Username or email").fill("admin");
  await page.getByLabel("Password").fill("fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Fixture question" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mark as resolved" }).click();
  await expect(page.getByText("No open reports.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Resolved", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reopen" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Resolved", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Reopen" }).click();
  await expect(page.getByText("No resolved reports yet.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Resolved", exact: true }),
  ).toBeFocused();
});

test("a failed status change keeps the report action focused", async ({
  page,
}) => {
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({
      status: 200,
      json: {
        id: "fixture",
        email: "admin@example.test",
        name: null,
        avatarUrl: null,
        username: "admin",
      },
    }),
  );
  await page.route("**/api/v1/admin/reports**", (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({ status: 409, json: { message: "Conflict" } })
      : route.fulfill({
          status: 200,
          json: { reports: [report], hasMore: false },
        }),
  );
  await page.goto("/admin");
  await page.getByRole("button", { name: "English", exact: true }).click();
  const action = page.getByRole("button", { name: "Mark as resolved" });
  await action.click();
  await expect(page.getByRole("alert")).toContainText(
    "A newer report for this issue is already open.",
  );
  await expect(action).toBeFocused();
});
