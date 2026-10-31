import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { openText, sealText } from "@/lib/crypto/seal";
import type { ChatSession, MessageRepository, SessionRepository, StoredMessage } from "./conversation/repositories";
import { MAX_PENDING_PROPOSALS, type MemoryProposal, type MemoryProposalRepository } from "./memory/proposals";
import { MemoryError, isExpired, validateMemoryText, type Memory, type MemoryRepository } from "./memory/store";
import type { EmergencyContactRepository } from "./safety/contact";
import type { EmergencyContactView } from "./safety/crisis";
import { isSocialActionDue, type SocialActionRepository, type SocialActionSuggestion } from "./scheduler/weekly";

// Supabase-backed repositories (supabase/migrations). Every query runs with the
// signed-in user's session, so row-level security enforces ownership; the
// service-role key is never used. All user text is sealed before storage (DP-1).

const PROPOSAL_REVIEW_MS = 7 * 24 * 60 * 60 * 1000;

type Row = Record<string, unknown>;

/** Database errors carry codes, never row content, into logs and responses. */
class StoreError extends Error {
  constructor(operation: string, code: string | undefined) {
    super(`Storage ${operation} failed (${code ?? "unknown"}).`);
    this.name = "StoreError";
  }
}

function must<T>(operation: string, result: { data: T; error: { code?: string } | null }): T {
  if (result.error) throw new StoreError(operation, result.error.code);
  return result.data;
}

const date = (value: unknown) => new Date(String(value));
const optionalDate = (value: unknown) => (value ? date(value) : null);

export function createSupabaseRepositories(db: SupabaseClient, ownerId: string, key: Buffer) {
  const seal = (text: string) => sealText(text, key, ownerId);
  const open = (text: unknown) => openText(String(text), key, ownerId);

  const toSession = (row: Row): ChatSession => ({
    id: String(row.id),
    userId: String(row.user_id),
    startedAt: date(row.created_at),
    disclosed: row.disclosed === true,
    endedBySafety: row.ended_reason === "safety",
    endedBySessionCap: row.ended_reason === "session_cap",
    memoriesReferenced: Array.isArray(row.memories_referenced) ? row.memories_referenced.map(String) : [],
    kept: row.kept !== false,
    title: row.title_sealed ? open(row.title_sealed) : null,
    tone: null,
  });

  const sessions: SessionRepository = {
    async create(userId) {
      const row = must(
        "conversation create",
        await db.from("conversations").insert({ user_id: userId }).select().single(),
      );
      return toSession(row as Row);
    },
    async get(sessionId) {
      const row = must("conversation read", await db.from("conversations").select().eq("id", sessionId).maybeSingle());
      return row ? toSession(row as Row) : null;
    },
    async update(session) {
      must(
        "conversation update",
        await db
          .from("conversations")
          .update({
            disclosed: session.disclosed,
            ended_reason: session.endedBySafety ? "safety" : session.endedBySessionCap ? "session_cap" : null,
            memories_referenced: session.memoriesReferenced.slice(-200),
            kept: session.kept,
            title_sealed: session.title ? seal(session.title) : null,
          })
          .eq("id", session.id),
      );
    },
    async listForUser(userId) {
      const rows = must(
        "conversation list",
        await db.from("conversations").select().eq("user_id", userId).order("created_at", { ascending: false }),
      );
      return (rows as Row[]).map(toSession);
    },
    async delete(userId, sessionId) {
      const rows = must(
        "conversation delete",
        await db.from("conversations").delete().eq("id", sessionId).eq("user_id", userId).select("id"),
      );
      return (rows as Row[]).length > 0;
    },
    async deleteAllForUser(userId) {
      must("conversation delete", await db.from("conversations").delete().eq("user_id", userId));
    },
    async keptIds() {
      const rows = must("conversation list", await db.from("conversations").select("id").eq("kept", true));
      return new Set((rows as Row[]).map((row) => String(row.id)));
    },
  };

  const toMessage = (row: Row): StoredMessage => ({
    id: String(row.id),
    sessionId: String(row.conversation_id),
    userId: String(row.user_id),
    role: row.role === "assistant" ? "assistant" : "user",
    text: open(row.content),
    createdAt: date(row.created_at),
    safety: row.safety === true,
  });

  const messages: MessageRepository = {
    async append(message) {
      const conversation = must(
        "conversation read",
        await db.from("conversations").select("context_epoch").eq("id", message.sessionId).single(),
      ) as Row;
      const row = must(
        "message append",
        await db
          .from("messages")
          .insert({
            user_id: message.userId,
            conversation_id: message.sessionId,
            role: message.role,
            content: seal(message.text),
            client_request_id: message.requestId ?? randomUUID(),
            context_epoch: conversation.context_epoch,
            safety: message.safety,
          })
          .select()
          .single(),
      );
      return toMessage(row as Row);
    },
    async listForSession(sessionId) {
      const rows = must(
        "message list",
        await db
          .from("messages")
          .select()
          .eq("conversation_id", sessionId)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true }),
      );
      return (rows as Row[]).map(toMessage);
    },
    async deleteAllForUser(userId) {
      must("message delete", await db.from("messages").delete().eq("user_id", userId));
    },
    async deleteOlderThan(cutoff, keptSessionIds) {
      let query = db.from("messages").delete().lt("created_at", cutoff.toISOString());
      if (keptSessionIds.size) query = query.not("conversation_id", "in", `(${[...keptSessionIds].join(",")})`);
      const rows = must("message retention", await query.select("id"));
      return (rows as Row[]).length;
    },
  };

  const toMemory = (row: Row): Memory => ({
    id: String(row.id),
    userId: String(row.user_id),
    text: open(row.content),
    createdAt: date(row.created_at),
    expiresAt: optionalDate(row.expires_at),
    editedByUser: Number(row.version) > 1,
  });

  const ownedMemoryUpdate = async (id: string, changes: Row) => {
    const rows = must("memory update", await db.from("memories").update(changes).eq("id", id).select());
    const row = (rows as Row[])[0];
    if (!row) throw new MemoryError("NOT_FOUND", "Memory not found.");
    return toMemory(row);
  };

  const memories: MemoryRepository = {
    async list(userId) {
      const rows = must(
        "memory list",
        await db.from("memories").select().eq("user_id", userId).order("created_at", { ascending: false }),
      );
      return (rows as Row[]).map(toMemory);
    },
    async listActive(userId, now) {
      return (await memories.list(userId)).filter((memory) => !isExpired(memory, now));
    },
    async create() {
      // The database only creates memories through accept_memory_proposal.
      throw new MemoryError("INVALID_TEXT", "Memories are saved only by approving a suggestion.");
    },
    async updateText(_userId, id, text) {
      return ownedMemoryUpdate(id, { content: seal(validateMemoryText(text)) });
    },
    async setExpiry(_userId, id, expiresAt, now) {
      if (expiresAt && expiresAt.getTime() <= now.getTime()) {
        throw new MemoryError("INVALID_EXPIRY", "Expiry must be in the future, or cleared.");
      }
      return ownedMemoryUpdate(id, { expires_at: expiresAt?.toISOString() ?? null });
    },
    async delete(_userId, id) {
      const rows = must("memory delete", await db.from("memories").delete().eq("id", id).select("id"));
      if (!(rows as Row[]).length) throw new MemoryError("NOT_FOUND", "Memory not found.");
    },
    async deleteAllForUser(userId) {
      must("memory delete", await db.from("memories").delete().eq("user_id", userId));
    },
    async deleteExpired(now) {
      const rows = must(
        "memory expiry",
        await db.from("memories").delete().lte("expires_at", now.toISOString()).select("id"),
      );
      return (rows as Row[]).length;
    },
    async contextRevision(userId) {
      const row = must(
        "profile read",
        await db.from("profiles").select("memory_revision").eq("id", userId).maybeSingle(),
      ) as Row | null;
      return Number(row?.memory_revision ?? 0);
    },
    async lastUserChangeAt(userId) {
      const row = must(
        "profile read",
        await db.from("profiles").select("memory_changed_at").eq("id", userId).maybeSingle(),
      ) as Row | null;
      return optionalDate(row?.memory_changed_at);
    },
  };

  const toProposal = (row: Row): MemoryProposal => ({
    id: String(row.id),
    userId: String(row.user_id),
    sessionId: row.conversation_id ? String(row.conversation_id) : null,
    text: open(row.suggested_content),
    createdAt: date(row.created_at),
  });

  const pendingRow = async (id: string) =>
    must(
      "proposal read",
      await db
        .from("memory_proposals")
        .select()
        .eq("id", id)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .maybeSingle(),
    ) as Row | null;

  const rpcError = (error: { code?: string }) =>
    error.code === "22023"
      ? new MemoryError("INVALID_EXPIRY", "Expiry must be in the future, or cleared.")
      : new MemoryError("NOT_FOUND", "Suggestion not found.");

  const proposals: MemoryProposalRepository = {
    async listPending(userId) {
      const rows = must(
        "proposal list",
        await db
          .from("memory_proposals")
          .select()
          .eq("user_id", userId)
          .eq("status", "pending")
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: true }),
      );
      return (rows as Row[]).map(toProposal);
    },
    async create(userId, text, now, sessionId) {
      if (!sessionId) throw new MemoryError("NOT_FOUND", "A suggestion needs its conversation.");
      if ((await proposals.listPending(userId)).length >= MAX_PENDING_PROPOSALS) {
        throw new MemoryError("LIMIT_REACHED", `At most ${MAX_PENDING_PROPOSALS} suggestions can wait for review.`);
      }
      const row = must(
        "proposal create",
        await db
          .from("memory_proposals")
          .insert({
            user_id: userId,
            conversation_id: sessionId,
            suggested_content: seal(validateMemoryText(text)),
            expires_at: new Date(now.getTime() + PROPOSAL_REVIEW_MS).toISOString(),
          })
          .select()
          .single(),
      );
      return toProposal(row as Row);
    },
    async get(_userId, id) {
      const row = await pendingRow(id);
      return row ? toProposal(row) : null;
    },
    async accept(_userId, id, text, expiresAt) {
      const row = await pendingRow(id);
      if (!row) throw new MemoryError("NOT_FOUND", "Suggestion not found.");
      const { data, error } = await db.rpc("accept_memory_proposal", {
        p_proposal_id: id,
        p_content: seal(validateMemoryText(text)),
        p_expires_at: expiresAt?.toISOString() ?? null,
        p_expected_version: row.version,
      });
      if (error) throw rpcError(error);
      return toMemory(data as Row);
    },
    async reject(_userId, id) {
      const row = await pendingRow(id);
      if (!row) return;
      const { error } = await db.rpc("reject_memory_proposal", { p_proposal_id: id, p_expected_version: row.version });
      if (error) throw rpcError(error);
    },
    async deleteAllForUser(userId) {
      must("proposal delete", await db.from("memory_proposals").delete().eq("user_id", userId));
    },
  };

  const socialActions: SocialActionRepository = {
    async lastSuggestedAt(userId) {
      const row = must(
        "action read",
        await db
          .from("social_actions")
          .select("created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ) as Row | null;
      return optionalDate(row?.created_at);
    },
    async recordIfDue(suggestion: SocialActionSuggestion) {
      if (!isSocialActionDue(await socialActions.lastSuggestedAt(suggestion.userId), suggestion.suggestedAt)) {
        return false;
      }
      must(
        "action create",
        await db
          .from("social_actions")
          .insert({ user_id: suggestion.userId, title: "Weekly suggestion", description: seal(suggestion.action) }),
      );
      return true;
    },
    async deleteAllForUser(userId) {
      must("action delete", await db.from("social_actions").delete().eq("user_id", userId));
    },
  };

  const contacts: EmergencyContactRepository = {
    async save(userId, contact: EmergencyContactView | null) {
      if (!contact) {
        must("contact delete", await db.from("emergency_contacts").delete().eq("user_id", userId));
        return;
      }
      must(
        "contact save",
        await db.from("emergency_contacts").upsert({ user_id: userId, sealed: seal(JSON.stringify(contact)) }),
      );
    },
    async getForCrisisView(userId) {
      const row = must(
        "contact read",
        await db.from("emergency_contacts").select("sealed").eq("user_id", userId).maybeSingle(),
      ) as Row | null;
      return row ? (JSON.parse(open(row.sealed)) as EmergencyContactView) : null;
    },
    async deleteAllForUser(userId) {
      must("contact delete", await db.from("emergency_contacts").delete().eq("user_id", userId));
    },
  };

  return { sessions, messages, memories, proposals, socialActions, contacts };
}
