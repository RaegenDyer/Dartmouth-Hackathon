import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let currentUser: string | null = null;
const auth = {
  getClaims: vi.fn(async () => ({
    data: currentUser ? { claims: { sub: currentUser, role: "authenticated", is_anonymous: true } } : null,
    error: null,
  })),
  signInAnonymously: vi.fn(async () => {
    currentUser = alice;
    return { error: null };
  }),
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
    chat: await import("@/app/api/chat/route"),
    proposals: await import("@/app/api/memory-proposals/route"),
    accept: await import("@/app/api/memory-proposals/[id]/accept/route"),
    dismiss: await import("@/app/api/memory-proposals/[id]/dismiss/route"),
    memories: await import("@/app/api/memories/route"),
    memory: await import("@/app/api/memories/[id]/route"),
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
  delete (globalThis as { __companion?: unknown }).__companion;
  currentUser = null;
});

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
    const response = await anonymous.POST(post("/api/auth/anonymous"));
    expect(await response.json()).toEqual({ authenticated: true, userId: alice, isAnonymous: true });
    expect(auth.signInAnonymously).toHaveBeenCalled();
  });

  it("chats, proposes a memory, and saves it only after approval", async () => {
    currentUser = alice;
    const conversationId = await newConversation();
    const response = await say(conversationId, "I live in Hanover.");
    expect(response.status).toBe(200);
    const result = (await response.json()) as { reply: string; memoryProposals: { id: string; text: string }[] };
    expect(result.reply).toMatch(/AI companion/);
    expect(result.memoryProposals.map((proposal) => proposal.text)).toEqual(["You live in Hanover."]);

    const { memories, accept, memory } = await routes();
    expect(((await (await memories.GET()).json()) as { memories: unknown[] }).memories).toEqual([]);

    const id = result.memoryProposals[0]?.id as string;
    const accepted = await accept.POST(
      post(`/api/memory-proposals/${id}/accept`, { content: "You live near Hanover.", expiresAt: null }),
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
      post(`/api/memory-proposals/${proposalId}/accept`, { content: "x", expiresAt: null }),
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
    expect(await getCompanion().deps.messages.listForSession(conversationId)).toHaveLength(2);
  });

  it("rejects oversized and malformed bodies", async () => {
    currentUser = alice;
    const conversationId = await newConversation();
    expect((await say(conversationId, "x".repeat(4001))).status).toBe(400);
    const { chat } = await routes();
    const extra = post("/api/chat", { conversationId, clientRequestId: randomUUID(), content: "hi", userId: bob });
    expect((await chat.POST(extra)).status).toBe(400);
    const huge = post("/api/chat", { conversationId, clientRequestId: randomUUID(), content: "y".repeat(20_000) });
    expect((await chat.POST(huge)).status).toBe(400);
  });
});
