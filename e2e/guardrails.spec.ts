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
  await page.goto("/app");
  await page.getByLabel("Write a message").fill("test message");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Call or text 988")).toBeVisible();
  await expect(page.getByLabel("Write a message")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Send" })).toHaveCount(0);
});

test("CD-2: the proof-of-concept notice is visible on the signed-in screen", async ({ page }) => {
  await mockSignedIn(page, {});
  await page.goto("/app");
  // Planned features are visible but disabled and labeled.
  await expect(page.getByRole("group", { name: "Scenarios, coming soon" }).getByRole("button").first()).toBeDisabled();
  await expect(page.getByRole("button", { name: "Voice conversations, coming soon" })).toBeDisabled();
  await expect(page.getByRole("button", { name: /listener/ })).toBeDisabled();
  await expect(page.getByText("coming soon").first()).toBeVisible();
  await expect(page.getByRole("note")).toContainText(/proof of concept/i);
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
  await page.goto("/app");
  await page.getByRole("button", { name: /under 18/ }).click();
  await expect(page.getByText(/only for adults/)).toBeVisible();
  await expect(page.getByRole("button", { name: /18 or older/ })).toHaveCount(0);
  expect(calls).not.toContain("/api/auth/anonymous");
});

test("DP-5: deleting data calls the deletion endpoint and signs the user out", async ({ page }) => {
  const calls = await mockSignedIn(page, {});
  await page.goto("/app");
  await page.getByRole("button", { name: "Delete my data" }).click();
  await page.getByRole("button", { name: "Delete everything" }).click();
  await expect(page.getByText(/were deleted/)).toBeVisible();
  expect(calls).toContain("DELETE /api/account");
  await expect(page.getByRole("button", { name: /18 or older/ })).toBeVisible();
});

test("OP-1: with the kill switch on, chat is off and a static crisis notice is shown", async ({
  page,
  request,
  baseURL,
}) => {
  if (!baseURL) throw new Error("The kill-switch check requires a configured baseURL.");
  const status = await request.get("/api/companion/status");
  expect(await status.json(), `Kill-switch status from ${status.url()}`).toEqual({ chatEnabled: false });
  const chat = await request.post("/api/chat", { data: {}, headers: { origin: new URL(baseURL).origin } });
  expect(chat.status()).toBe(503);
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Chat is turned off right now." })).toBeVisible();
  await expect(page.getByText(/call or text 988/)).toBeVisible();
  await expect(page.getByLabel("Write a message")).toHaveCount(0);
});

test("phone layout: bottom tabs, notice on every tab, in-chat cards, no sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockSignedIn(page, {
    reply:
      "A lab where everyone's paired off can feel sealed.\n\nOne small idea for this week, only if it sounds good: say hi to one person at the gym. No pressure either way.",
    route: "normal",
    safetyTriggered: false,
    conversationEnded: false,
    crisis: null,
    memoryProposals: [{ id: "p1", text: "You like climbing." }],
  });
  await page.route("**/api/memory-proposals", (route) =>
    json(route, { proposals: [{ id: "p1", text: "You like climbing." }] }),
  );
  await page.goto("/app");
  const tabs = page.getByRole("navigation", { name: "Sections" }).last();
  await expect(tabs).toBeVisible();
  await page.getByLabel("Write a message").fill("Kind of lonely in my lab.");
  await page.getByRole("button", { name: "send" }).click();
  await expect(page.locator(".card.step")).toContainText("say hi to one person at the gym");
  await expect(page.locator(".card.remember")).toContainText("You like climbing.");
  for (const name of ["memories", "history", "chat"]) {
    await tabs.getByRole("button", { name: new RegExp(name) }).click();
    await expect(page.getByRole("note")).toContainText(/proof of concept/i);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const tabIcons = tabs.locator("img.icon");
  await expect(tabIcons).toHaveCount(3);
  for (const icon of await tabIcons.all()) {
    expect(await icon.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  }
});

/** A long transcript and two long side panels expose accidental document scrolling. */
async function mockLongConversation(page: Page) {
  await mockSignedIn(page, { reply: "A new reply.", conversationEnded: false, crisis: null, memoryProposals: [] });
  const conversations = Array.from({ length: 30 }, (_, index) => ({
    id: `history-${index}`,
    title: `Saved conversation ${index}`,
    startedAt: "2026-10-31T12:00:00.000Z",
    ended: false,
  }));
  await page.route("**/api/conversations", (route) => json(route, { conversations }));
  await page.route("**/api/conversations/history-*", (route) =>
    json(route, {
      conversation: conversations[0],
      messages: Array.from({ length: 70 }, (_, index) => ({
        id: `message-${index}`,
        role: index % 2 ? "assistant" : "user",
        text: `Earlier message ${index}. A few thoughts about getting used to a new place.\nAnother everyday detail from that conversation.`,
      })),
    }),
  );
  await page.route("**/api/memories", (route) =>
    json(route, {
      memories: Array.from({ length: 25 }, (_, index) => ({
        id: `memory-${index}`,
        text: `You enjoy weekend activity ${index} with your neighbors.`,
        expiresAt: null,
      })),
    }),
  );
}

async function openLongConversation(page: Page, phone: boolean) {
  await page.goto("/app");
  await expect(page.getByLabel("Write a message")).toBeVisible();
  if (phone) await page.locator(".tabbar").getByRole("button", { name: "history", exact: true }).click();
  await page.locator(".history-open").first().click();
  await expect(page.getByRole("log")).toContainText("Earlier message 69.");
}

for (const { name, viewport } of [
  { name: "desktop", viewport: { width: 1440, height: 900 } },
  { name: "tablet", viewport: { width: 1000, height: 800 } },
  { name: "phone", viewport: { width: 390, height: 844 } },
  { name: "short window", viewport: { width: 844, height: 390 } },
]) {
  test(`${name}: chat and side panels scroll without moving the document`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockLongConversation(page);
    const phone = viewport.width <= 760;
    await openLongConversation(page, phone);
    const log = page.getByRole("log");
    await expect.poll(() => log.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1))
      .toBe(true);
    const composer = await page.locator(".composer").boundingBox();
    expect(composer).not.toBeNull();
    expect(composer!.y + composer!.height).toBeLessThanOrEqual(viewport.height);

    await log.evaluate((element) => {
      element.scrollTop = 0;
    });
    await log.hover();
    await page.mouse.wheel(0, 600);
    await expect.poll(() => log.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await log.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await page.mouse.wheel(0, 600);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

    if (viewport.width <= 1100) {
      const navigation = page.locator(phone ? ".tabbar" : ".rail-nav");
      await navigation.getByRole("button", { name: /memories/ }).click();
    }
    const memories = page.locator(".space");
    await expect(memories).toBeVisible();
    await memories.evaluate((element) => {
      element.scrollTop = 0;
    });
    await memories.hover();
    await page.mouse.wheel(0, 600);
    await expect.poll(() => memories.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await memories.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await page.mouse.wheel(0, 600);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test("a delayed reply keeps the reader's position in older messages", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockLongConversation(page);
  let releaseReply: () => void = () => {};
  const replyReady = new Promise<void>((resolve) => {
    releaseReply = resolve;
  });
  await page.route("**/api/chat", async (route) => {
    await replyReady;
    return json(route, {
      reply: "The delayed reply is here.",
      conversationEnded: false,
      crisis: null,
      memoryProposals: [],
    });
  });
  await openLongConversation(page, false);
  const log = page.getByRole("log");
  await page.getByLabel("Write a message").fill("A new thought about this week.");
  await page.getByRole("button", { name: "send", exact: true }).click();
  await expect(page.getByText("Candid is replying…", { exact: true })).toBeVisible();
  await log.evaluate((element) => {
    element.scrollTop = 0;
    return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
  releaseReply();
  await expect(log).toContainText("The delayed reply is here.");
  await expect.poll(() => log.evaluate((element) => element.scrollTop)).toBeLessThan(10);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test.describe("memory dates follow the user's calendar", () => {
  test.use({ timezoneId: "America/New_York" });

  test("editing text preserves the exact expiry and shows its local calendar date", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockSignedIn(page, {});
    const expiry = new Date(Date.now() + 10 * 86_400_000);
    expiry.setUTCHours(0, 0, 0, 0);
    const expiresAt = expiry.toISOString();
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(expiry);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((value) => value.type === type)!.value;
    const localDate = `${part("year")}-${part("month")}-${part("day")}`;
    const memory = { id: "editable-memory", text: "You enjoy climbing.", expiresAt };
    await page.route("**/api/memories", (route) => json(route, { memories: [memory] }));
    let patch: unknown;
    await page.route("**/api/memories/editable-memory", (route) => {
      patch = route.request().postDataJSON();
      return json(route, { memory: { ...memory, text: "You enjoy hiking." } });
    });
    await page.goto("/app");
    await page.getByRole("button", { name: "Edit memory: You enjoy climbing.", exact: true }).click();
    await expect(page.getByLabel("Expiry date")).toHaveValue(localDate);
    await page.getByLabel("edit memory", { exact: true }).fill("You enjoy hiking.");
    await page.getByRole("button", { name: "save changes", exact: true }).click();
    await expect(page.getByRole("button", { name: "Edit memory: You enjoy hiking.", exact: true })).toBeVisible();
    expect(patch).toEqual({ content: "You enjoy hiking." });
  });
});

for (const failure of ["network", "server", "malformed", "session unavailable"] as const) {
  test(`session startup recovers from a ${failure} status failure without creating an account`, async ({ page }) => {
    let attempts = 0;
    let signups = 0;
    await page.route("**/api/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/companion/status") {
        attempts++;
        if (attempts === 1 && failure !== "session unavailable") {
          if (failure === "network") return route.abort("failed");
          if (failure === "server") return json(route, { error: "temporarily unavailable" }, 500);
          return json(route, { unexpected: true });
        }
        return json(route, { chatEnabled: true });
      }
      if (path === "/api/auth/session") {
        if (attempts === 1 && failure === "session unavailable") return json(route, { error: "unavailable" }, 503);
        return json(route, { authenticated: false });
      }
      if (path === "/api/auth/anonymous") signups++;
      return json(route, { error: "unexpected request" }, 500);
    });
    await page.goto("/app");
    await expect(page.locator(".welcome .notice[role='alert']")).toContainText("couldn't connect");
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page.getByRole("button", { name: "yes, I'm 18 or older", exact: true })).toBeVisible();
    expect(attempts).toBe(2);
    expect(signups).toBe(0);
  });
}

test("a failed memory edit stays editable and a pending retry sends only one request", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockSignedIn(page, {});
  const memory = { id: "retry-memory", text: "You enjoy climbing.", expiresAt: null };
  await page.route("**/api/memories", (route) => json(route, { memories: [memory] }));
  let requests = 0;
  let finishSave: () => void = () => {};
  const saveReady = new Promise<void>((resolve) => {
    finishSave = resolve;
  });
  await page.route("**/api/memories/retry-memory", async (route) => {
    requests++;
    if (requests === 1) return route.abort("failed");
    await saveReady;
    return json(route, { memory: { ...memory, text: "You enjoy hiking." } });
  });
  await page.goto("/app");
  await page.getByRole("button", { name: "Edit memory: You enjoy climbing.", exact: true }).click();
  await page.getByLabel("edit memory", { exact: true }).fill("You enjoy hiking.");
  await page.getByRole("button", { name: "save changes", exact: true }).click();
  await expect(page.locator(".edit-memory").getByRole("alert")).toContainText("Check your connection");
  await expect(page.getByLabel("edit memory", { exact: true })).toHaveValue("You enjoy hiking.");
  try {
    await page.getByRole("button", { name: "save changes", exact: true }).dblclick();
    await expect(page.getByRole("button", { name: "saving…", exact: true })).toBeDisabled();
    expect(requests).toBe(2);
  } finally {
    finishSave();
  }
  await expect(page.getByRole("button", { name: "Edit memory: You enjoy hiking.", exact: true })).toBeVisible();
});

for (const unavailable of ["memory-proposals", "memories"] as const) {
  test(`startup retries an unavailable ${unavailable} list instead of showing an empty inbox`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockSignedIn(page, {});
    const requests = { "memory-proposals": 0, memories: 0 };
    for (const endpoint of ["memory-proposals", "memories"] as const) {
      await page.route(`**/api/${endpoint}`, (route) => {
        requests[endpoint]++;
        if (endpoint === unavailable && requests[endpoint] === 1)
          return json(route, { error: "temporarily unavailable" }, 503);
        return endpoint === "memory-proposals"
          ? json(route, { proposals: [{ id: "pending", text: "You enjoy climbing." }] })
          : json(route, { memories: [{ id: "saved", text: "You live near campus.", expiresAt: null }] });
      });
    }
    await page.goto("/app");
    await expect(page.locator(".welcome .notice[role='alert']")).toContainText("couldn't connect");
    await expect(page.getByText("Nothing saved yet.", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page.getByLabel("Write a message")).toBeVisible();
    await expect(page.locator(".space").getByText("You enjoy climbing.", { exact: true })).toBeVisible();
    await expect(page.locator(".space").getByText("You live near campus.", { exact: true })).toBeVisible();
    expect(requests[unavailable]).toBe(2);
  });
}
