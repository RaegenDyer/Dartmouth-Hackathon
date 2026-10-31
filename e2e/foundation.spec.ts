import { expect, test, type Page } from "@playwright/test";

// Exercise navigation without creating real anonymous accounts or calling a model.
async function mockAppSession(page: Page, initiallyAuthenticated: boolean) {
  const calls: string[] = [];
  let authenticated = initiallyAuthenticated;
  await page.route("**/api/**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    calls.push(`${request.method()} ${path}`);
    let body: unknown;
    switch (path) {
      case "/api/companion/status":
        body = { chatEnabled: true };
        break;
      case "/api/auth/session":
        body = authenticated
          ? { authenticated: true, userId: "visitor", isAnonymous: true, ageConfirmed: true }
          : { authenticated: false };
        break;
      case "/api/auth/anonymous":
        authenticated = true;
        body = { userId: "visitor", isAnonymous: true, ageConfirmed: true };
        break;
      case "/api/conversations":
        body = { conversations: [] };
        break;
      case "/api/memory-proposals":
        body = { proposals: [] };
        break;
      case "/api/memories":
        body = { memories: [] };
        break;
      default:
        return route.fulfill({ status: 500, json: { error: { message: "Unexpected API request" } } });
    }
    return route.fulfill({ json: body });
  });
  return calls;
}

const landingHeading = (page: Page) =>
  page.getByRole("heading", { level: 1, name: /a new place\.\s*a little more familiar\./ });

test("health endpoint responds", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({ status: "ok" });
});

for (const { name, viewport } of [
  { name: "desktop", viewport: { width: 1280, height: 900 } },
  { name: "phone", viewport: { width: 390, height: 844 } },
]) {
  test.describe(`${name} landing navigation`, () => {
    test.use({ viewport });

    test("a new visitor can enter the app from the landing page and return home", async ({ page }) => {
      const calls = await mockAppSession(page, false);
      await page.goto("/");
      await expect(landingHeading(page)).toBeVisible();
      await expect(page.getByRole("link", { name: "Open app", exact: true }).first()).toHaveAttribute("href", "/app");
      expect(calls).toEqual([]);

      await page.getByRole("link", { name: "Start a conversation", exact: true }).click();
      await expect(page).toHaveURL(/\/app$/);
      await expect(page.getByRole("button", { name: /yes, I'm 18 or older/i })).toBeVisible();
      expect(calls).not.toContain("POST /api/auth/anonymous");
      await page.getByRole("button", { name: /yes, I'm 18 or older/i }).click();
      await expect(page.getByLabel("Write a message")).toBeVisible();
      expect(calls).toContain("POST /api/auth/anonymous");

      const callsBeforeHome = calls.length;
      await page.getByRole("link", { name: "Back to home", exact: true }).click();
      await expect(page).toHaveURL(/\/$/);
      await expect(landingHeading(page)).toBeVisible();
      expect(calls).toHaveLength(callsBeforeHome);
    });
  });
}

test("the landing page stays public while returning visitors can open their session", async ({ page }) => {
  const calls = await mockAppSession(page, true);
  await page.goto("/");
  await expect(landingHeading(page)).toBeVisible();
  await expect(page.getByLabel("Write a message")).toHaveCount(0);
  expect(calls).toEqual([]);

  await page.getByRole("link", { name: "Open app", exact: true }).first().click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByLabel("Write a message")).toBeVisible();
  await expect(page.getByRole("button", { name: /yes, I'm 18 or older/i })).toHaveCount(0);
  expect(calls).not.toContain("POST /api/auth/anonymous");

  await page.getByRole("link", { name: "Back to home", exact: true }).click();
  await expect(landingHeading(page)).toBeVisible();
});

// Milestone 1 flows still to automate against a real session. The crisis screen
// is covered by e2e/guardrails.spec.ts (CS-5).
test.describe("milestone 1 user flows", () => {
  test.fixme("sign up with an optional emergency contact", async () => {});
  test.fixme("log in", async () => {});
  test.fixme("send a message and see the AI disclosure", async () => {});
  test.fixme("view and delete a memory", async () => {});
});
