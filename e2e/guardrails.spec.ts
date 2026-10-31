import { expect, test, type Page, type Route } from "@playwright/test";

// Guardrail E2E checks (docs/guardrails.md). UI flows mock the API so they run
// without Supabase or a model; the kill-switch test uses the real server, which
// playwright.config.ts starts with COMPANION_CHAT_DISABLED=true.

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

async function mockSignedIn(page: Page, chatReply: Record<string, unknown>) {
  const calls: string[] = [];
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    calls.push(`${route.request().method()} ${url.pathname}`);
    switch (url.pathname) {
      case "/api/companion/status":
        return json(route, { chatEnabled: true });
      case "/api/auth/session":
        return json(route, { authenticated: true, userId: "u", isAnonymous: true, ageConfirmed: true });
      case "/api/conversations":
        return route.request().method() === "POST"
          ? json(route, { conversationId: "c" }, 201)
          : json(route, { conversations: [] });
      case "/api/memory-proposals":
        return json(route, { proposals: [] });
      case "/api/memories":
        return json(route, { memories: [] });
      case "/api/chat":
        return json(route, chatReply);
      case "/api/account":
        return route.fulfill({ status: 204 });
      default:
        return route.continue();
    }
  });
  return calls;
}

test("CS-5: the crisis screen contains no chat input", async ({ page }) => {
  await mockSignedIn(page, {
    reply: "I'm an AI and I can't help with this, so I'm ending our normal conversation here.",
    route: "safety",
    safetyTriggered: true,
    conversationEnded: true,
    crisis: {
      resources: [{ label: "988 Suicide and Crisis Lifeline (US)", contact: "Call or text 988" }],
      emergencyContact: null,
      contactNote: null,
    },
    memoryProposals: [],
  });
  await page.goto("/");
  await page.getByLabel("Write a message").fill("test message");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Call or text 988")).toBeVisible();
  await expect(page.getByLabel("Write a message")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Send" })).toHaveCount(0);
});

test("CD-2: the proof-of-concept notice is visible on the signed-in screen", async ({ page }) => {
  await mockSignedIn(page, {});
  await page.goto("/");
  await expect(page.getByRole("note")).toContainText("Proof of concept");
});

test("AA-1: someone who says they are under 18 cannot continue", async ({ page }) => {
  const calls: string[] = [];
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    calls.push(url.pathname);
    if (url.pathname === "/api/companion/status") return json(route, { chatEnabled: true });
    if (url.pathname === "/api/auth/session") return json(route, { authenticated: false });
    return json(route, { error: { message: "unexpected" } }, 500);
  });
  await page.goto("/");
  await page.getByRole("button", { name: /under 18/ }).click();
  await expect(page.getByText(/only for adults/)).toBeVisible();
  await expect(page.getByRole("button", { name: /18 or older/ })).toHaveCount(0);
  expect(calls).not.toContain("/api/auth/anonymous");
});

test("DP-5: deleting data calls the deletion endpoint and signs the user out", async ({ page }) => {
  const calls = await mockSignedIn(page, {});
  await page.goto("/");
  await page.getByRole("button", { name: "Delete my data" }).click();
  await page.getByRole("button", { name: "Delete everything" }).click();
  await expect(page.getByText(/were deleted/)).toBeVisible();
  expect(calls).toContain("DELETE /api/account");
  await expect(page.getByRole("button", { name: /18 or older/ })).toBeVisible();
});

test("OP-1: with the kill switch on, chat is off and a static crisis notice is shown", async ({ page, request }) => {
  expect(await (await request.get("/api/companion/status")).json()).toEqual({ chatEnabled: false });
  const chat = await request.post("/api/chat", { data: {}, headers: { origin: "http://127.0.0.1:3100" } });
  expect(chat.status()).toBe(503);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Chat is turned off right now." })).toBeVisible();
  await expect(page.getByText(/call or text 988/)).toBeVisible();
  await expect(page.getByLabel("Write a message")).toHaveCount(0);
});
