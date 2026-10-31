import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let currentUser: string | null = null;
let ageConfirmed = true;
const auth = {
  getClaims: vi.fn(async () => ({
    data: currentUser
      ? {
          claims: {
            sub: currentUser,
            role: "authenticated",
            is_anonymous: true,
            user_metadata: { age_confirmed: ageConfirmed },
          },
        }
      : null,
    error: null,
  })),
  signInAnonymously: vi.fn(async (input: { options: { data: { age_confirmed: boolean } } }) => {
    currentUser = alice;
    ageConfirmed = input.options.data.age_confirmed;
    return { error: null };
  }),
  signOut: vi.fn(async () => ({ error: null })),
};
vi.mock("@/lib/supabase/server", () => ({ createRouteSupabaseClient: async () => ({ auth }) }));

const alice = "0b5e3c1e-7d2a-4c1b-9f3e-2a6d8c4b1e7f";
const bob = "6f1d2e3c-4b5a-4978-8c6d-5e4f3a2b1c0d";
const origin = "http://localhost:3000";

const post = (path: string, body?: unknown, headers: Record<string, string> = { origin }) =>
  new Request(`${origin}${path}`, {
    method: "POST",
    headers: { ...headers, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function routes() {
  return {
    anonymous: await import("@/app/api/auth/anonymous/route"),
    conversations: await import("@/app/api/conversations/route"),
    conversation: await import("@/app/api/conversations/[id]/route"),
    chat: await import("@/app/api/chat/route"),
    proposals: await import("@/app/api/memory-proposals/route"),
    accept: await import("@/app/api/memory-proposals/[id]/accept/route"),
    dismiss: await import("@/app/api/memory-proposals/[id]/dismiss/route"),
    memories: await import("@/app/api/memories/route"),
    memory: await import("@/app/api/memories/[id]/route"),
    account: await import("@/app/api/account/route"),
    status: await import("@/app/api/companion/status/route"),
  };
}

async function newConversation() {
  const { conversations } = await routes();
  const response = await conversations.POST(post("/api/conversations", { scenario: "check_in" }));
  expect(response.status).toBe(201);
  return ((await response.json()) as { conversationId: string }).conversationId;
}

const say = async (conversationId: string, content: string, clientRequestId = randomUUID()) =>
  (await routes()).chat.POST(post("/api/chat", { conversationId, clientRequestId, content }));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test-only");
  vi.stubEnv("LLM_ADAPTER", "mock");
  vi.stubEnv("COMPANION_STORAGE", "memory");
  // The fixture must be self-contained even when a hosting build inherits
  // NODE_ENV=production. Runtime validation still requires a configured key.
  vi.stubEnv("CONTACT_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
  delete (globalThis as { __companionStore?: unknown }).__companionStore;
  delete (globalThis as { __anonLimiter?: unknown }).__anonLimiter;
  currentUser = null;
  ageConfirmed = true;
});

afterEach(() => vi.unstubAllEnvs());

describe("companion routes", () => {
  it("require a verified session and a same-origin request", async () => {
    const { chat, proposals } = await routes();
    const body = { conversationId: randomUUID(), clientRequestId: randomUUID(), content: "hi" };
    expect((await chat.POST(post("/api/chat", body))).status).toBe(401);
    expect((await proposals.GET()).status).toBe(401);
    currentUser = alice;
    expect((await chat.POST(post("/api/chat", body, { "sec-fetch-site": "cross-site" }))).status).toBe(403);
  });

  it("starts an anonymous session", async () => {
    const { anonymous } = await routes();
    expect((await anonymous.POST(post("/api/auth/anonymous"))).status).toBe(400);
    expect((await anonymous.POST(post("/api/auth/anonymous", { ageConfirmed: false }))).status).toBe(400);
    const response = await anonymous.POST(post("/api/auth/anonymous", { ageConfirmed: true }));
    expect(await response.json()).toEqual({
      authenticated: true,
      userId: alice,
      isAnonymous: true,
      ageConfirmed: true,
    });
    expect(auth.signInAnonymously).toHaveBeenCalledWith({ options: { data: { age_confirmed: true } } });
  });

  it("AA-1: refuses companion routes until the user confirms their age", async () => {
    currentUser = alice;
    ageConfirmed = false;
    const { conversations } = await routes();
    const response = await conversations.POST(post("/api/conversations", { scenario: "check_in" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ ageRequired: true });
  });

  it("chats, proposes a memory, and saves it only after approval", async () => {
    currentUser = alice;
    const conversationId = await newConversation();
    const response = await say(conversationId, "I live in Hanover.");
    expect(response.status).toBe(200);
    const result = (await response.json()) as { reply: string; memoryProposals: { id: string; text: string }[] };
    // The disclosure arrived in Candid's opening message, so the reply does not repeat it.
    expect(result.reply).not.toMatch(/AI companion/);
    expect(result.memoryProposals.map((proposal) => proposal.text)).toEqual(["You live in Hanover."]);

    const { memories, accept, memory } = await routes();
    expect(((await (await memories.GET()).json()) as { memories: unknown[] }).memories).toEqual([]);

    const id = result.memoryProposals[0]?.id as string;
    const accepted = await accept.POST(
      post(`/api/memory-proposals/${id}/accept`, { content: "You live near Hanover.", keep: false }),
      params(id),
    );
    expect(accepted.status).toBe(200);
    const saved = ((await (await memories.GET()).json()) as { memories: { id: string; text: string }[] }).memories;
    expect(saved.map((item) => item.text)).toEqual(["You live near Hanover."]);

    const removed = await memory.DELETE(
      new Request(`${origin}/api/memories/${saved[0]?.id}`, { method: "DELETE", headers: { origin } }),
      params(saved[0]?.id as string),
    );
    expect(removed.status).toBe(204);
  });

  it("hides one user's conversation and suggestions from another", async () => {
    currentUser = alice;
    const conversationId = await newConversation();
    const { memoryProposals } = (await (await say(conversationId, "I live in Hanover.")).json()) as {
      memoryProposals: { id: string }[];
    };
    const proposalId = memoryProposals[0]?.id as string;

    currentUser = bob;
    expect((await say(conversationId, "hello")).status).toBe(404);
    const { accept, dismiss, proposals } = await routes();
    const stolen = await accept.POST(
      post(`/api/memory-proposals/${proposalId}/accept`, { content: "x", keep: true }),
      params(proposalId),
    );
    expect(stolen.status).toBe(404);
    expect((await dismiss.POST(post(`/api/memory-proposals/${proposalId}/dismiss`), params(proposalId))).status).toBe(
      404,
    );
    expect(((await (await proposals.GET()).json()) as { proposals: unknown[] }).proposals).toEqual([]);
  });

  it("returns the same turn for a retried clientRequestId", async () => {
    currentUser = alice;
    const conversationId = await newConversation();
    const requestId = randomUUID();
    const first = (await (await say(conversationId, "Hi there", requestId)).json()) as { reply: string };
    const retry = (await (await say(conversationId, "Hi there", requestId)).json()) as { reply: string };
    expect(retry.reply).toBe(first.reply);
    const { getCompanion } = await import("@/lib/companion/server");
    expect(
      await getCompanion({ supabase: {} as never, userId: alice }).deps.messages.listForSession(conversationId),
    ).toHaveLength(3); // opening message + one user turn + one reply
  });

  it("rejects oversized and malformed bodies", async () => {
    currentUser = alice;
    const conversationId = await newConversation();
    expect((await say(conversationId, "x".repeat(1001))).status).toBe(400);
    const { chat } = await routes();
    const extra = post("/api/chat", { conversationId, clientRequestId: randomUUID(), content: "hi", userId: bob });
    expect((await chat.POST(extra)).status).toBe(400);
    const huge = post("/api/chat", { conversationId, clientRequestId: randomUUID(), content: "y".repeat(20_000) });
    expect((await chat.POST(huge)).status).toBe(400);
  });

  it("DP-5: account deletion removes messages, memories, and suggestions, then signs out", async () => {
    currentUser = alice;
    const conversationId = await newConversation();
    await say(conversationId, "I live in Hanover. I like chess.");
    const { account } = await routes();
    const { getCompanion } = await import("@/lib/companion/server");
    const companion = getCompanion({ supabase: {} as never, userId: alice });
    const [proposal] = await companion.deps.proposals.listPending(alice);
    await companion.deps.memories.create(alice, proposal?.text ?? "x", new Date());

    const response = await account.DELETE(
      new Request(`${origin}/api/account`, { method: "DELETE", headers: { origin } }),
    );
    expect(response.status).toBe(204);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(await companion.deps.messages.listForSession(conversationId)).toEqual([]);
    expect(await companion.deps.memories.list(alice)).toEqual([]);
    expect(await companion.deps.proposals.listPending(alice)).toEqual([]);
    expect(await companion.deps.sessions.listForUser(alice)).toEqual([]);
  });

  it("OP-1: the kill switch turns off chat without a code change", async () => {
    currentUser = alice;
    const conversationId = await newConversation();
    vi.stubEnv("COMPANION_CHAT_DISABLED", "true");
    const { status, conversations } = await routes();
    expect(await status.GET().json()).toEqual({ chatEnabled: false });
    const chat = await say(conversationId, "hello");
    expect(chat.status).toBe(503);
    expect(await chat.json()).toMatchObject({ chatDisabled: true });
    expect((await conversations.POST(post("/api/conversations", { scenario: "check_in" }))).status).toBe(503);
    vi.stubEnv("COMPANION_CHAT_DISABLED", "false");
    expect(await status.GET().json()).toEqual({ chatEnabled: true });
  });

  it("AA-2: limits new anonymous sessions per IP", async () => {
    const { anonymous } = await routes();
    const start = () =>
      anonymous.POST(post("/api/auth/anonymous", { ageConfirmed: true }, { origin, "x-forwarded-for": "203.0.113.9" }));
    for (let attempt = 0; attempt < 10; attempt += 1) {
      currentUser = null;
      expect((await start()).status).toBe(200);
    }
    currentUser = null;
    expect((await start()).status).toBe(429);
  });

  it("saves conversations by default and lets the owner list, reopen, and delete them", async () => {
    currentUser = alice;
    const first = await newConversation();
    await say(first, "I live in Hanover. I like chess.");
    const second = await newConversation();
    await say(second, "Class got cancelled so I read in the park");
    const { conversations, conversation } = await routes();

    const list = (await (await conversations.GET()).json()) as { conversations: { id: string; title: string }[] };
    expect(list.conversations.map((item) => item.id).sort()).toEqual([first, second].sort());
    expect(list.conversations.find((item) => item.id === first)?.title).toBe("I live in Hanover. I like chess.");

    const opened = (await (
      await conversation.GET(new Request(`${origin}/api/conversations/${first}`), params(first))
    ).json()) as {
      messages: { role: string; text: string }[];
    };
    expect(opened.messages.map((message) => message.role)).toEqual(["assistant", "user", "assistant"]);
    expect(opened.messages[0]?.text).toMatch(/I'm Candid, an AI companion/);
    expect(opened.messages[1]?.text).toBe("I live in Hanover. I like chess.");

    currentUser = bob;
    expect((await conversation.GET(new Request(`${origin}/api/conversations/${first}`), params(first))).status).toBe(
      404,
    );
    const foreignDelete = await conversation.DELETE(
      new Request(`${origin}/api/conversations/${first}`, { method: "DELETE", headers: { origin } }),
      params(first),
    );
    expect(foreignDelete.status).toBe(404);

    currentUser = alice;
    const deleted = await conversation.DELETE(
      new Request(`${origin}/api/conversations/${first}`, { method: "DELETE", headers: { origin } }),
      params(first),
    );
    expect(deleted.status).toBe(204);
    const after = (await (await conversations.GET()).json()) as { conversations: { id: string }[] };
    expect(after.conversations.map((item) => item.id)).toEqual([second]);
    const { getCompanion } = await import("@/lib/companion/server");
    const companion = getCompanion({ supabase: {} as never, userId: alice });
    expect(await companion.deps.messages.listForSession(first)).toEqual([]);
    expect((await companion.deps.proposals.listPending(alice)).every((item) => item.sessionId !== first)).toBe(true);
  });
});
