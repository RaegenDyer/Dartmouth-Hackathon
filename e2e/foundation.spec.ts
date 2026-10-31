import { expect, test } from "@playwright/test";

test("health endpoint responds", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({ status: "ok" });
});

test("home page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toBeVisible();
});

// Milestone 1 flows still to automate against a real session. The crisis screen
// is covered by e2e/guardrails.spec.ts (CS-5).
test.describe("milestone 1 user flows", () => {
  test.fixme("sign up with an optional emergency contact", async () => {});
  test.fixme("log in", async () => {});
  test.fixme("send a message and see the AI disclosure", async () => {});
  test.fixme("view and delete a memory", async () => {});
});
