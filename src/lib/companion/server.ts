import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { createConversationService, runRetention, type RespondResult } from "./conversation/respond";
import { createInMemoryCompanion } from "./in-memory";
import { MINUTE_MS, policyFromEnvironment } from "./limits";
import { createLlmAdapter } from "./llm/select";
import { consoleLogger } from "./log";
import { createSupabaseRepositories } from "./supabase-store";
import { createMessageRateLimiter } from "./rate-limit";
import { parseContactKey } from "./safety/contact";

// LOCAL TESTING ONLY: conversations, suggestions, and memories live in this
// server process and disappear on restart. A multi-instance deployment needs the
// Supabase-backed repositories (not built yet) behind the same interfaces.

const MAX_REMEMBERED_REQUESTS = 1_000;
const RETENTION_INTERVAL_MS = MINUTE_MS;

/**
 * DP-1: in production the data-protection key must come from configuration held
 * outside the database. Fail closed rather than run with a throwaway key.
 */
export function resolveDataKey(env: Record<string, string | undefined> = process.env): Buffer {
  if (env.CONTACT_ENCRYPTION_KEY?.trim()) return parseContactKey(env.CONTACT_ENCRYPTION_KEY);
  if (env.NODE_ENV === "production") {
    throw new Error("CONTACT_ENCRYPTION_KEY is required in production.");
  }
  return randomBytes(32);
}

/** OP-1: kill switch. Read per request, so changing it needs no code change. */
export function isChatDisabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.COMPANION_CHAT_DISABLED?.trim().toLowerCase() === "true";
}

/** Bump when the store's shape changes, so a dev hot reload rebuilds it. */
const STORE_VERSION = 3;

/** Data that must survive across requests and dev hot reloads. */
function createStore() {
  const { deps } = createInMemoryCompanion({ log: consoleLogger, contactKey: resolveDataKey() });
  return {
    version: STORE_VERSION,
    repositories: deps,
    rateLimiter: createMessageRateLimiter(),
    /** clientRequestId -> turn, so a retried send never runs the model twice. */
    turns: new Map<string, Promise<RespondResult>>(),
    /** DB-5 redirect counts per user. */
    redirectCounts: new Map<string, number>(),
    /** Conversations with a turn in progress. */
    activeSessions: new Set<string>(),
    /** Last retention run per user. */
    lastRetentionRun: new Map<string, number>(),
  };
}

type CompanionStore = ReturnType<typeof createStore>;
const globalStore = globalThis as typeof globalThis & { __companionStore?: CompanionStore };

/** "supabase" (default) stores data in the database; "memory" keeps it in this process (tests). */
export function storageMode(env: Record<string, string | undefined> = process.env): "supabase" | "memory" {
  return env.COMPANION_STORAGE?.trim().toLowerCase() === "memory" ? "memory" : "supabase";
}

/** The signed-in caller whose session (and RLS) every database query uses. */
export interface CompanionCaller {
  supabase: SupabaseClient;
  userId: string;
}

/**
 * Builds the conversation service for one request. Data lives in Supabase under
 * the caller's session (or in process memory in "memory" mode). The service,
 * model adapter, and policy are rebuilt per request, so edited guardrail code
 * and changed settings apply immediately. Expired memories are removed for the
 * caller at most once a minute per process.
 */
export function getCompanion(caller: CompanionCaller) {
  if (globalStore.__companionStore?.version !== STORE_VERSION) globalStore.__companionStore = createStore();
  const store = globalStore.__companionStore;
  const repositories =
    storageMode() === "memory"
      ? store.repositories
      : createSupabaseRepositories(caller.supabase, caller.userId, resolveDataKey());
  const policy = policyFromEnvironment();
  const nowMs = Date.now();
  const lastRun = store.lastRetentionRun.get(caller.userId) ?? 0;
  if (nowMs - lastRun >= RETENTION_INTERVAL_MS) {
    store.lastRetentionRun.set(caller.userId, nowMs);
    void runRetention(repositories, new Date(nowMs), policy).catch(() => undefined);
  }
  const deps = {
    ...repositories,
    llm: createLlmAdapter(),
    log: consoleLogger,
    policy,
    redirectCounts: store.redirectCounts,
    activeSessions: store.activeSessions,
  };
  return { ...store, deps, policy, ...createConversationService(deps) };
}

type ServerCompanion = ReturnType<typeof getCompanion>;

/** Runs a turn once per (user, clientRequestId); repeats share the same result. */
export function respondOnce(
  companion: ServerCompanion,
  userId: string,
  clientRequestId: string,
  run: () => Promise<RespondResult>,
): Promise<RespondResult> {
  const key = `${userId}:${clientRequestId}`;
  const existing = companion.turns.get(key);
  if (existing) return existing;
  const turn = run();
  companion.turns.set(key, turn);
  // A failed turn may be retried with the same ID.
  turn.catch(() => companion.turns.delete(key));
  if (companion.turns.size > MAX_REMEMBERED_REQUESTS) {
    const oldest = companion.turns.keys().next().value;
    if (oldest) companion.turns.delete(oldest);
  }
  return turn;
}
