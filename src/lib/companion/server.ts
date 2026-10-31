import "server-only";
import { randomBytes } from "node:crypto";
import type { RespondResult } from "./conversation/respond";
import { createInMemoryCompanion } from "./in-memory";
import { createLlmAdapter } from "./llm/select";
import { createMessageRateLimiter } from "./rate-limit";
import { parseContactKey } from "./safety/contact";
import { consoleSafetyLogger } from "./safety/crisis";

// LOCAL TESTING ONLY: conversations, suggestions, and memories live in this
// server process and disappear on restart. A multi-instance deployment needs the
// Supabase-backed repositories (not built yet) behind the same interfaces.

const MAX_REMEMBERED_REQUESTS = 1_000;

function createServerCompanion() {
  const contactKey = process.env.CONTACT_ENCRYPTION_KEY?.trim()
    ? parseContactKey(process.env.CONTACT_ENCRYPTION_KEY)
    : randomBytes(32);
  return {
    ...createInMemoryCompanion({ llm: createLlmAdapter(), logSafety: consoleSafetyLogger, contactKey }),
    rateLimiter: createMessageRateLimiter(),
    /** clientRequestId -> turn, so a retried send never runs the model twice. */
    turns: new Map<string, Promise<RespondResult>>(),
  };
}

type ServerCompanion = ReturnType<typeof createServerCompanion>;
const globalStore = globalThis as typeof globalThis & { __companion?: ServerCompanion };

/** One instance per server process; survives dev hot reloads. */
export function getCompanion(): ServerCompanion {
  globalStore.__companion ??= createServerCompanion();
  return globalStore.__companion;
}

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
